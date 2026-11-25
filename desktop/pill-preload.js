const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("pillApi", {
  onState: cb => ipcRenderer.on("state", (e, s) => cb(s)),
  open: () => ipcRenderer.send("pill-open"),
  hide: () => ipcRenderer.send("pill-hide"),
  dragStart: () => ipcRenderer.send("pill-drag-start"),
  dragStop: () => ipcRenderer.send("pill-drag-stop")
});
