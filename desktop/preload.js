// Fonctions de l'app de bureau, offertes uniquement à la page Nuque Droite
const { contextBridge, ipcRenderer } = require("electron");

const ours = location.origin === "https://fcasado69.github.io" || location.protocol === "file:";
if (ours) {
  contextBridge.exposeInMainWorld("nuqueNative", {
    platform: process.platform,
    pill: s => ipcRenderer.send("pill", s),
    pillShow: on => ipcRenderer.send("pill-show", on),
    blur: (on, t, a) => ipcRenderer.send("blur", { on: !!on, t: t || "", a: a || "" }),
    show: () => ipcRenderer.send("show"),
    getLogin: () => ipcRenderer.invoke("login-get"),
    setLogin: on => ipcRenderer.invoke("login-set", on),
    onCmd: cb => ipcRenderer.on("cmd", (e, c) => cb(c))
  });
}
