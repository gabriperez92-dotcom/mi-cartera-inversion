const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const http = require("http");
const https = require("https");
const { URL, URLSearchParams } = require("url");
const Store = require("electron-store");

// ── CONFIG ────────────────────────────────────────────────────────────────────
// Usamos el cliente WEB para compartir archivos con la PWA (mismo client_id = mismo acceso)
const CLIENT_ID     = "210722723646-s39ol1paaens6leu94et32b0m65me2p7.apps.googleusercontent.com";
const CLIENT_SECRET = "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"; // ← Pega el Client Secret del cliente web de Google Cloud
const REDIRECT_PORT = 42813;
const REDIRECT_URI  = `http://localhost:${REDIRECT_PORT}`;
const SCOPES        = "https://www.googleapis.com/auth/drive.file";
const FILE_NAME     = "investment-tracker-data.json";

const tokenStore = new Store({ name: "auth-tokens" });

let cache       = null;  // datos en memoria para evitar lecturas repetidas
let driveFileId = null;
let saveTimer   = null;
let quitting    = false;
let authFailed  = false;

// ── HTTPS HELPER ──────────────────────────────────────────────────────────────
function req(method, rawUrl, { token, body, raw, extraHeaders = {} } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(rawUrl);
    const isForm = body instanceof URLSearchParams;
    const bodyStr =
      body == null ? "" : isForm ? body.toString() : JSON.stringify(body);
    const headers = { ...extraHeaders };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (body != null) {
      headers["Content-Type"] = isForm
        ? "application/x-www-form-urlencoded"
        : "application/json";
      headers["Content-Length"] = Buffer.byteLength(bodyStr);
    }
    const request = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method, headers },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (raw) return resolve(data);
          try { resolve(JSON.parse(data)); } catch { resolve(data); }
        });
      }
    );
    request.on("error", reject);
    if (bodyStr) request.write(bodyStr);
    request.end();
  });
}

// ── AUTH ──────────────────────────────────────────────────────────────────────
async function getAccessToken() {
  const tokens = tokenStore.get("tokens");
  if (!tokens) return null;
  if (Date.now() < tokens.expires_at - 60_000) return tokens.access_token;

  // Refrescar token
  try {
    const r = await req("POST", "https://oauth2.googleapis.com/token", {
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: tokens.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    if (!r.access_token) return null;
    tokenStore.set("tokens", {
      ...tokens,
      access_token: r.access_token,
      expires_at: Date.now() + r.expires_in * 1000,
    });
    return r.access_token;
  } catch {
    return null; // permite que ensureAuth() llame a authorize()
  }
}

function authorize() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (request, res) => {
      const code = new URL(
        request.url,
        `http://localhost:${REDIRECT_PORT}`
      ).searchParams.get("code");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        "<h2 style='font-family:sans-serif;margin:40px'>✅ Autorizado. Puedes cerrar esta pestaña.</h2>"
      );
      server.close();
      if (!code) return reject(new Error("Sin código de autorización"));
      const r = await req("POST", "https://oauth2.googleapis.com/token", {
        body: new URLSearchParams({
          code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: "authorization_code",
        }),
      });
      if (!r.access_token) return reject(new Error("Sin token de acceso"));
      tokenStore.set("tokens", {
        access_token: r.access_token,
        refresh_token: r.refresh_token,
        expires_at: Date.now() + r.expires_in * 1000,
      });
      resolve(r.access_token);
    });

    server.listen(REDIRECT_PORT, () => {
      const url =
        "https://accounts.google.com/o/oauth2/v2/auth?" +
        new URLSearchParams({
          client_id: CLIENT_ID,
          redirect_uri: REDIRECT_URI,
          response_type: "code",
          scope: SCOPES,
          access_type: "offline",
          prompt: "consent",
        });
      shell.openExternal(url);
    });
    server.on("error", (err) => {
      reject(new Error("Puerto " + REDIRECT_PORT + " ocupado: " + err.message));
    });
  });
}

async function ensureAuth() {
  const t = await getAccessToken();
  return t ?? (await authorize());
}

// ── DRIVE API ─────────────────────────────────────────────────────────────────
async function findOrCreateFile(token) {
  const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
  const list = await req(
    "GET",
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`,
    { token }
  );
  if (list.files?.length) return list.files[0].id;

  const created = await req(
    "POST",
    "https://www.googleapis.com/drive/v3/files?fields=id",
    { token, body: { name: FILE_NAME, mimeType: "application/json" } }
  );
  return created.id;
}

async function readDriveFile(token, id) {
  return req(
    "GET",
    `https://www.googleapis.com/drive/v3/files/${id}?alt=media`,
    { token, raw: true }
  );
}

async function writeDriveFile(token, id, data) {
  return req(
    "PATCH",
    `https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`,
    { token, body: data }
  );
}

// ── CACHE + GUARDADO CON DEBOUNCE ─────────────────────────────────────────────
async function ensureLoaded() {
  if (cache !== null) return;
  const token = await ensureAuth();
  driveFileId = await findOrCreateFile(token);
  const raw = await readDriveFile(token, driveFileId);
  try {
    cache = raw ? JSON.parse(raw) : {};
  } catch {
    cache = {};
  }
}

async function flushToCloud() {
  if (!cache) return;
  try {
    const token = await ensureAuth();
    if (!driveFileId) driveFileId = await findOrCreateFile(token);
    await writeDriveFile(token, driveFileId, cache);
  } catch (e) {
    console.error("flushToCloud:", e);
    const wins = BrowserWindow.getAllWindows();
    if (wins.length) wins[0].webContents.send("save-error");
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => flushToCloud().catch(console.error), 2000);
}

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle("storage-get", async (_e, key) => {
  try {
    await ensureLoaded();
    authFailed = false;
    return cache[key] ? { value: cache[key] } : null;
  } catch (e) {
    console.error("storage-get:", e);
    authFailed = true;
    cache = null; // reset para permitir reintento
    return null;
  }
});

ipcMain.handle("storage-set", async (_e, key, value) => {
  try {
    if (!cache) cache = {};
    cache[key] = value;
    scheduleSave();
  } catch (e) {
    console.error("storage-set:", e);
  }
});

ipcMain.handle("storage-status", () => ({ authFailed }));

// ── COTIZACIONES (Yahoo Finance) ──────────────────────────────────────────────
const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json",
};

ipcMain.handle("fetch-quote", async (_e, isinOrTicker) => {
  if (!isinOrTicker) return { error: "no_isin" };
  try {
    // Paso 1: buscar símbolo en Yahoo Finance
    const searchData = await req("GET",
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(isinOrTicker)}&quotesCount=5&newsCount=0&enableFuzzyQuery=false`,
      { extraHeaders: YF_HEADERS }
    );
    let symbol = searchData?.quotes?.[0]?.symbol;

    // Si no encontrado por búsqueda, intentar como ticker directo
    if (!symbol) symbol = isinOrTicker.trim().toUpperCase();

    // Paso 2: obtener cotización diaria
    const chartData = await req("GET",
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
      { extraHeaders: YF_HEADERS }
    );
    const meta = chartData?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return { error: "no_data" };

    const price = meta.regularMarketPrice;
    const prevClose = meta.previousClose ?? meta.chartPreviousClose;
    const change = prevClose ? price - prevClose : 0;
    const changePct = prevClose ? (change / prevClose) * 100 : 0;

    return { symbol, price, change, changePct, currency: meta.currency ?? "EUR" };
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle("storage-reauth", async () => {
  cache = null;
  driveFileId = null;
  tokenStore.delete("tokens");
  try {
    await ensureLoaded();
    authFailed = false;
    return { ok: true };
  } catch (e) {
    authFailed = true;
    return { ok: false, error: e.message };
  }
});

// ── VENTANA ───────────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    title: "Mi Cartera de Inversión",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, "../dist/index.html"));
  win.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);

// Guardar antes de cerrar
app.on("before-quit", (event) => {
  if (quitting) return;
  clearTimeout(saveTimer);
  event.preventDefault();
  quitting = true;
  flushToCloud()
    .catch(console.error)
    .finally(() => app.exit(0));
});

app.on("window-all-closed", () => app.quit());
