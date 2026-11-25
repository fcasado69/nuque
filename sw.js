// Nuque Droite : mise en cache pour fonctionner hors ligne après la première ouverture
const CACHE = "nuque-droite-v29";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];
const RUNTIME = ["cdn.jsdelivr.net", "storage.googleapis.com", "fonts.googleapis.com", "fonts.gstatic.com"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if(e.request.method !== "GET") return;
  if(u.origin === location.origin){
    // l'app : réseau d'abord (pour recevoir les mises à jour), cache si hors ligne
    e.respondWith(fetch(e.request, {cache:"no-cache"}).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
  } else if(RUNTIME.includes(u.hostname)){
    // moteur d'analyse et polices : cache d'abord (gros fichiers qui ne changent pas)
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { if(r.ok || r.type === "opaque"){ const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); } return r; })));
  }
});
