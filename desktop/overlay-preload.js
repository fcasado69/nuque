const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("overlayApi", {
  platform: process.platform,
  onMsg: cb => ipcRenderer.on("msg", (e, m) => cb(m)),
  snooze: ms => ipcRenderer.send("overlay-snooze", ms)
});
