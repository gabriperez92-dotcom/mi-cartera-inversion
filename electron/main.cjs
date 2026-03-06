const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const Store = require("electron-store");

const store = new Store({ name: "investment-tracker" });

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

ipcMain.handle("storage-get", (_event, key) => {
  const value = store.get(key);
  return value ? { value } : null;
});

ipcMain.handle("storage-set", (_event, key, value) => {
  store.set(key, value);
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  app.quit();
});
