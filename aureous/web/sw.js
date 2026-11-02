// Aureous service worker: makes the site installable as an app and quick to open.
//  - Pages: network first, so a new version always shows when online; the saved copy opens offline.
//  - Our own scripts, styles, fonts and icons: served from the saved copy and refreshed in the background.
//    (Published files carry ?v=<version>, so a new release is a new address and is fetched fresh.)
//  - Everything else (Hyperliquid prices, the trading server, Google sign-in) is never touched.
const CACHE = "aureous-v1";
const SHELL = ["./", "manifest.webmanifest", "icons/icon-192.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const STATIC = /\.(?:js|css|woff2|png|webmanifest)$/;
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/__/")) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(res => {
      if (res.ok && (url.pathname.endsWith("/") || /\.html$/.test(url.pathname))) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(async () => (await caches.match(req, {ignoreSearch: true})) || (await caches.match("./")) || Response.error()));
    return;
  }
  if (!STATIC.test(url.pathname)) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req);
    const fresh = fetch(req).then(res => {
      if (res.ok) {
        c.put(req, res.clone());
        // drop older versions of the same file (theme.js?v=old) so the cache doesn't grow
        c.keys().then(ks => ks.forEach(k => { const u = new URL(k.url); if (u.pathname === url.pathname && u.search !== url.search) c.delete(k); }));
      }
      return res;
    }).catch(() => hit);
    return hit || fresh;
  }));
});
