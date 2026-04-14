const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("storage", {
  get: (key) => ipcRenderer.invoke("storage-get", key),
  set: (key, value) => ipcRenderer.invoke("storage-set", key, value),
  status: () => ipcRenderer.invoke("storage-status"),
  reauth: () => ipcRenderer.invoke("storage-reauth"),
  onSaveError: (cb) => ipcRenderer.on("save-error", cb),
});

contextBridge.exposeInMainWorld("quotes", {
  fetch: (isinOrTicker) => ipcRenderer.invoke("fetch-quote", isinOrTicker),
});
