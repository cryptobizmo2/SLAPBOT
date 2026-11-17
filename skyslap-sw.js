/* Big Mouf: Sky Slap offline support.
   Registered with scope ./skyslap, so it only ever controls the game page, never the rest of the site.
   The game page is network-first (you always get the newest upload when online) with the last copy kept for offline.
   Everything else the game talks to (the game server, wallets, ads) is never touched. */
const CACHE = 'skyslap-v1';
const FONTS = 'skyslap-fonts-v1';
const SHELL = ['skyslap.html', 'skyslap.webmanifest', 'skyslap-icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('skyslap-') && k !== CACHE && k !== FONTS).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    const file = url.pathname.split('/').pop();
    if (req.mode === 'navigate' || file === 'skyslap.html') {
      e.respondWith(
        fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' })
          .then((res) => {
            if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('skyslap.html', copy)); }
            return res;
          })
          .catch(() => caches.match('skyslap.html').then((hit) => hit || Response.error()))
      );
      return;
    }
    if (SHELL.includes(file)) e.respondWith(caches.match(file).then((hit) => hit || fetch(req)));
    return;
  }
  // Google Fonts: keep a copy so the game's lettering still works offline.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then((c) => c.match(req).then((hit) => {
      const net = fetch(req).then((res) => { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res; }).catch(() => hit || Response.error());
      return hit || net;
    })));
  }
});
