// Mismo client_id que el Electron → comparten acceso al mismo archivo en Drive
const CLIENT_ID =
  "210722723646-s39ol1paaens6leu94et32b0m65me2p7.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/drive.file";
const FILE_NAME = "investment-tracker-data.json";

declare global {
  interface Window {
    google: {
      accounts: {
        oauth2: {
          initTokenClient: (config: object) => {
            requestAccessToken: (opts?: object) => void;
          };
        };
      };
    };
  }
}

export class DriveStorage {
  private token: string | null = null;
  private tokenExpiry = 0;
  private fileId: string | null = null;
  private cache: Record<string, string> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  // Solicitar token de Google (muestra popup solo si hace falta)
  requestToken(): Promise<string> {
    return new Promise((resolve, reject) => {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (resp: { access_token?: string; expires_in?: number; error?: string }) => {
          if (resp.error || !resp.access_token) {
            return reject(new Error(resp.error ?? "Sin token"));
          }
          this.token = resp.access_token;
          this.tokenExpiry = Date.now() + ((resp.expires_in ?? 3600) - 60) * 1000;
          resolve(resp.access_token);
        },
      });
      client.requestAccessToken({ prompt: "" });
    });
  }

  private async getToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiry) return this.token;
    return this.requestToken();
  }

  private async driveGet(url: string): Promise<Response> {
    const token = await this.getToken();
    return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  }

  private async driveFetch(
    method: string,
    url: string,
    body?: object | string
  ): Promise<Response> {
    const token = await this.getToken();
    const isStr = typeof body === "string";
    return fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": isStr ? "application/json" : "application/json",
      },
      body: body != null ? (isStr ? body : JSON.stringify(body)) : undefined,
    });
  }

  private async findOrCreateFile(): Promise<string> {
    const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
    const res = await this.driveGet(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`
    );
    const data = await res.json();
    if (data.files?.length) return data.files[0].id as string;

    const created = await this.driveFetch(
      "POST",
      "https://www.googleapis.com/drive/v3/files?fields=id",
      { name: FILE_NAME, mimeType: "application/json" }
    );
    return ((await created.json()) as { id: string }).id;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.cache !== null) return;
    if (!this.fileId) this.fileId = await this.findOrCreateFile();
    const res = await this.driveGet(
      `https://www.googleapis.com/drive/v3/files/${this.fileId}?alt=media`
    );
    const text = await res.text();
    this.cache = text ? (JSON.parse(text) as Record<string, string>) : {};
  }

  async get(key: string): Promise<{ value: string } | null> {
    await this.ensureLoaded();
    const v = this.cache![key];
    return v ? { value: v } : null;
  }

  async set(key: string, value: string): Promise<void> {
    if (!this.cache) this.cache = {};
    this.cache[key] = value;
    this.scheduleSave();
  }

  private scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush().catch(console.error), 2000);
  }

  async flush(): Promise<void> {
    if (!this.fileId) this.fileId = await this.findOrCreateFile();
    await this.driveFetch(
      "PATCH",
      `https://www.googleapis.com/upload/drive/v3/files/${this.fileId}?uploadType=media`,
      JSON.stringify(this.cache)
    );
  }
}
