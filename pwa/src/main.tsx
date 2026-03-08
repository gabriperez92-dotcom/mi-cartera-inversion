import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "../../investment-tracker";
import LoginScreen from "./LoginScreen";
import { DriveStorage } from "./DriveStorage";

declare global {
  interface Window {
    storage: {
      get: (key: string) => Promise<{ value: string } | null>;
      set: (key: string, value: string) => Promise<void>;
    };
  }
}

const storage = new DriveStorage();

function Root() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleLogin() {
    setError(undefined);
    try {
      await storage.requestToken();
      window.storage = {
        get: (k) => storage.get(k),
        set: (k, v) => storage.set(k, v),
      };
      setLoggedIn(true);
    } catch (e) {
      setError("No se pudo conectar con Google. Inténtalo de nuevo.");
      console.error(e);
    }
  }

  if (!loggedIn) {
    return <LoginScreen onLogin={handleLogin} error={error} />;
  }
  return <App />;
}

// Esperar a que cargue el script de Google Identity Services
function waitForGIS(cb: () => void) {
  if (window.google?.accounts?.oauth2) {
    cb();
  } else {
    setTimeout(() => waitForGIS(cb), 100);
  }
}

waitForGIS(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <Root />
    </StrictMode>
  );
});
