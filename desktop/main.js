// Nuque Droite — app de bureau (Mac / Windows)
// Charge la version web en ligne (toujours à jour). Sans connexion, une copie embarquée prend le relais.
// Ajoute ce que le navigateur ne sait pas faire de façon fiable : icône près de l'horloge / dans la barre des menus,
// fonctionnement en fond, pastille toujours au premier plan, flou de tout l'écran, lancement au démarrage.
const { app, BrowserWindow, Tray, Menu, ipcMain, session, screen, nativeImage, systemPreferences, shell } = require("electron");
const path = require("path");
const fs = require("fs");

const REMOTE = "https://fcasado69.github.io/nuque/";
const LOCAL = path.join(__dirname, "web", "index.html");
const ICON = path.join(__dirname, "icon.png");
const IS_MAC = process.platform === "darwin";

// Le son des alertes doit marcher même si l'app démarre toute seule, sans clic
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.setAppUserModelId("fr.nuquedroite.app");

if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null, pill = null, tray = null, overlays = [], quitting = false;
let snoozeUntil = 0, pillWanted = true, lastPill = null, lastBlur = null;

/* ---------- petit stockage des préférences de l'app ---------- */
const cfgPath = () => path.join(app.getPath("userData"), "desktop.json");
function readCfg() { try { return JSON.parse(fs.readFileSync(cfgPath(), "utf8")); } catch (e) { return {}; } }
function writeCfg(c) { try { fs.writeFileSync(cfgPath(), JSON.stringify(c)); } catch (e) {} }
let cfg = {};

/* ---------- fenêtre principale ---------- */
function createWin() {
  const wa = screen.getPrimaryDisplay().workArea;
  const w = 480, h = Math.min(860, wa.height - 40);
  const b = cfg.winBounds || { width: w, height: h, x: wa.x + wa.width - w - 16, y: wa.y + 16 };
  win = new BrowserWindow({
    ...b, minWidth: 360, minHeight: 480, title: "Nuque Droite", icon: ICON, show: false,
    backgroundColor: "#0E1514", autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.js"), backgroundThrottling: false }
  });
  win.removeMenu?.();
  loadApp();
  win.once("ready-to-show", () => { if (!process.argv.includes("--hidden") && !app.getLoginItemSettings().wasOpenedAsHidden) win.show(); });
  win.on("close", e => {
    if (quitting) return;
    e.preventDefault(); win.hide();
    if (!cfg.toldHide) { cfg.toldHide = true; writeCfg(cfg); tray?.displayBalloon?.({ title: "Nuque Droite continue de veiller", content: "Retrouvez-la ici, près de l'horloge. Clic droit pour quitter.", iconType: "info" }); }
  });
  const save = () => { if (!win.isMinimized() && !win.isMaximized()) { cfg.winBounds = win.getBounds(); writeCfg(cfg); } };
  win.on("moved", save); win.on("resized", save);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith(REMOTE) && !url.startsWith("file:")) { e.preventDefault(); shell.openExternal(url); } });
}
function loadApp() {
  let fellBack = false;
  const fallback = () => { if (fellBack) return; fellBack = true; win.loadFile(LOCAL); };
  win.webContents.on("did-fail-load", (e, code, desc, url, isMain) => { if (isMain && url.startsWith("http")) fallback(); });
  win.loadURL(REMOTE).catch(fallback);
}
function showWin() { if (!win) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); }

/* ---------- pastille toujours au premier plan ---------- */
function defaultPillPos() {
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: wa.x + wa.width - 316, y: wa.y + wa.height - 80 };
}
// Garde la pastille entièrement visible sur l'écran le plus proche
function clampPill(x, y) {
  const W = 300, H = 64;
  const wa = screen.getDisplayNearestPoint({ x: x + W / 2, y: y + H / 2 }).workArea;
  return {
    x: Math.round(Math.min(Math.max(x, wa.x), wa.x + wa.width - W)),
    y: Math.round(Math.min(Math.max(y, wa.y), wa.y + wa.height - H))
  };
}
function savePillPos() { if (!pill) return; const b = pill.getBounds(); cfg.pillPos = { x: b.x, y: b.y }; writeCfg(cfg); }
function resetPill() {
  if (!pill) return;
  const p = defaultPillPos(); pill.setPosition(p.x, p.y); savePillPos();
  if (!pillWanted) setPillVisible(true); else pill.showInactive();
}
// Déplacement fait par l'app elle-même : fiable même si la fenêtre ne prend pas le focus
let pillDrag = null;
function pillDragStop() {
  if (!pillDrag) return;
  clearInterval(pillDrag.timer); pillDrag = null;
  const b = pill.getBounds(), c = clampPill(b.x, b.y);
  if (c.x !== b.x || c.y !== b.y) pill.setPosition(c.x, c.y);
  savePillPos();
}
function pillDragStart() {
  if (!pill) return;
  pillDragStop();
  const cur = screen.getCursorScreenPoint(), b = pill.getBounds();
  const off = { x: cur.x - b.x, y: cur.y - b.y };
  pillDrag = { timer: setInterval(() => {
    const c = screen.getCursorScreenPoint();
    pill.setPosition(c.x - off.x, c.y - off.y);
  }, 12) };
  setTimeout(() => { if (pillDrag) pillDragStop(); }, 30000); // filet de sécurité
}

function createPill() {
  const p = cfg.pillPos ? clampPill(cfg.pillPos.x, cfg.pillPos.y) : defaultPillPos();
  pill = new BrowserWindow({
    width: 300, height: 64, x: p.x, y: p.y, frame: false, transparent: true, resizable: false, movable: true,
    alwaysOnTop: true, skipTaskbar: true, focusable: false, acceptFirstMouse: true, hasShadow: true, show: false, fullscreenable: false,
    webPreferences: { preload: path.join(__dirname, "pill-preload.js") }
  });
  pill.setAlwaysOnTop(true, "floating");
  pill.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  pill.loadFile(path.join(__dirname, "pill.html"));
  pill.on("moved", () => { if (!pillDrag) savePillPos(); });
  pill.webContents.on("did-finish-load", () => { if (lastPill) pill.webContents.send("state", lastPill); });
}
function setPillVisible(on) {
  pillWanted = on; cfg.pill = on; writeCfg(cfg);
  if (!pill) return;
  if (on) pill.showInactive(); else pill.hide();
  buildTrayMenu();
}

/* ---------- flou de tout l'écran (alerte qui insiste) ---------- */
function showBlur(title, action) {
  if (Date.now() < snoozeUntil) return;
  if (!overlays.length) {
    for (const d of screen.getAllDisplays()) {
      const o = new BrowserWindow({
        ...d.bounds, frame: false, transparent: true, resizable: false, movable: false, alwaysOnTop: true,
        skipTaskbar: true, hasShadow: false, show: false, fullscreenable: false, enableLargerThanScreen: true,
        ...(IS_MAC ? { vibrancy: "fullscreen-ui", visualEffectState: "active" } : { backgroundMaterial: "acrylic" }),
        webPreferences: { preload: path.join(__dirname, "overlay-preload.js") }
      });
      o.setAlwaysOnTop(true, "screen-saver");
      o.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      o.loadFile(path.join(__dirname, "overlay.html"));
      o.webContents.on("did-finish-load", () => { o.webContents.send("msg", lastBlur); o.showInactive(); });
      overlays.push(o);
    }
  } else overlays.forEach(o => o.webContents.send("msg", lastBlur));
}
function hideBlur() { overlays.forEach(o => { try { o.destroy(); } catch (e) {} }); overlays = []; }
function snooze(ms) {
  snoozeUntil = ms ? Date.now() + ms : 0;
  hideBlur();
  win?.webContents.send("cmd", { cmd: "snooze", ms });
  buildTrayMenu();
}

/* ---------- icône près de l'horloge / barre des menus ---------- */
function trayImage() {
  const img = nativeImage.createFromPath(ICON);
  return img.resize({ width: IS_MAC ? 18 : 16, height: IS_MAC ? 18 : 16 });
}
function buildTrayMenu() {
  if (!tray) return;
  const login = app.getLoginItemSettings().openAtLogin;
  const paused = Date.now() < snoozeUntil;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Ouvrir Nuque Droite", click: showWin },
    { label: "Exercices nuque (2 min)", click: () => { showWin(); win.webContents.send("cmd", { cmd: "exo" }); } },
    { type: "separator" },
    { label: "Pastille flottante", type: "checkbox", checked: pillWanted, click: m => setPillVisible(m.checked) },
    { label: "Replacer la pastille en bas à droite", click: resetPill },
    paused
      ? { label: "Réactiver les alertes", click: () => snooze(0) }
      : { label: "Pause des alertes", submenu: [
          { label: "30 minutes", click: () => snooze(30 * 60e3) },
          { label: "1 heure", click: () => snooze(60 * 60e3) },
          { label: "2 heures", click: () => snooze(120 * 60e3) }] },
    { label: "Lancer au démarrage de l'ordinateur", type: "checkbox", checked: login, click: m => setLogin(m.checked) },
    { type: "separator" },
    { label: "Quitter Nuque Droite", click: () => { quitting = true; app.quit(); } }
  ]));
}
function setLogin(on) {
  app.setLoginItemSettings({ openAtLogin: on, openAsHidden: true, args: ["--hidden"] });
  cfg.loginSet = true; writeCfg(cfg);
  buildTrayMenu();
}

/* ---------- échanges avec la page ---------- */
ipcMain.on("pill", (e, s) => {
  lastPill = s;
  pill?.webContents.send("state", s);
  if (pill && pillWanted && !pill.isVisible()) pill.showInactive();
  tray?.setToolTip(`Nuque Droite — ${s.title || ""}`);
});
ipcMain.on("pill-show", (e, on) => setPillVisible(on !== false));
ipcMain.on("blur", (e, b) => { lastBlur = b; if (b && b.on) showBlur(); else hideBlur(); });
ipcMain.on("show", showWin);
// Disposition des écrans, pour deviner où est la caméra (portable en dessous ou à côté de l'écran externe)
ipcMain.handle("screens", () => {
  const list = screen.getAllDisplays(), cur = win ? screen.getDisplayMatching(win.getBounds()) : screen.getPrimaryDisplay();
  return { list: list.map(d => ({ internal: !!d.internal, x: d.bounds.x, y: d.bounds.y, w: d.bounds.width, h: d.bounds.height })), cur: list.findIndex(d => d.id === cur.id) };
});
ipcMain.handle("login-get", () => app.getLoginItemSettings().openAtLogin);
ipcMain.handle("login-set", (e, on) => { setLogin(!!on); return on; });
ipcMain.on("pill-open", showWin);
ipcMain.on("pill-hide", () => setPillVisible(false));
ipcMain.on("pill-drag-start", pillDragStart);
ipcMain.on("pill-drag-stop", pillDragStop);ipcMain.on("overlay-snooze", (e, ms) => snooze(ms));

/* ---------- démarrage ---------- */
app.on("second-instance", showWin);
app.on("activate", showWin);
app.on("before-quit", () => { quitting = true; });
app.on("window-all-closed", e => { /* l'app reste dans la barre */ });

app.whenReady().then(async () => {
  cfg = readCfg();
  pillWanted = cfg.pill !== false;
  // Caméra et notifications autorisées pour notre page uniquement
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => {
    const url = details.requestingUrl || wc.getURL();
    const ours = url.startsWith(REMOTE) || url.startsWith("file:");
    cb(ours && ["media", "notifications", "clipboard-sanitized-write", "fullscreen", "window-management"].includes(perm));
  });
  session.defaultSession.setPermissionCheckHandler((wc, perm, origin) => {
    return (origin || "").startsWith("https://fcasado69.github.io") || (origin || "").startsWith("file:");
  });
  if (IS_MAC) { try { await systemPreferences.askForMediaAccess("camera"); } catch (e) {} app.dock?.setIcon(ICON); }
  // Premier lancement : démarrage automatique activé (décochable dans le menu ou les Réglages)
  if (!cfg.loginSet) setLogin(true);

  tray = new Tray(trayImage());
  tray.setToolTip("Nuque Droite");
  tray.on("click", () => (IS_MAC ? null : showWin()));
  buildTrayMenu();

  createWin();
  createPill();
  // Si un écran est débranché, on ramène la pastille sur un écran visible
  screen.on("display-removed", () => {
    if (!pill) return;
    const b = pill.getBounds(), c = clampPill(b.x, b.y);
    pill.setPosition(c.x, c.y); savePillPos();
  });
});
