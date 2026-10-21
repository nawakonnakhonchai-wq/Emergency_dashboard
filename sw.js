/* EMCC dashboard service worker — makes the site installable and usable offline.
   Bump VERSION whenever app files change so phones pick up the new version. */
const VERSION = 'emcc-v1';
const SHELL = `${VERSION}-shell`;     // the app's own files
const LIBS = `${VERSION}-libs`;       // d3, Leaflet, fonts from CDNs
const DATA = 'emcc-data';             // last ArcGIS answers (kept across versions)
const TILES = 'emcc-tiles';           // map tiles (kept across versions)
const MAX_DATA = 400;
const MAX_TILES = 600;

const SHELL_FILES = [
  './', 'index.html', 'manifest.webmanifest',
  'assets/style.css', 'assets/app.js', 'assets/auth.js', 'assets/pwa.js',
  'data/emergency_case.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/favicon-48.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keep = new Set([SHELL, LIBS, DATA, TILES]);
    for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));

async function trim(cacheName, max) {
  const c = await caches.open(cacheName);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

/* own files: network first (so updates show at once), cache when offline */
async function shell(req) {
  const c = await caches.open(SHELL);
  try {
    const res = await Promise.race([fetch(req), timeout(5000)]);
    if (res.ok) c.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') return (await c.match('index.html')) || Response.error();
    throw err;
  }
}

/* ArcGIS queries: network first; keep a copy stamped with when it was saved */
async function arcgis(req) {
  const c = await caches.open(DATA);
  try {
    const res = await Promise.race([fetch(req), timeout(12000)]);
    if (res.ok) {
      const body = await res.clone().arrayBuffer();
      const h = new Headers(res.headers);
      h.set('x-emcc-cached-at', String(Date.now()));
      await c.put(req, new Response(body, { status: 200, headers: h }));
      trim(DATA, MAX_DATA);
    }
    return res;
  } catch (err) {
    const hit = await c.match(req);
    if (hit) return hit;
    throw err;
  }
}

/* libraries and fonts never change at a pinned version: cache first */
async function libs(req) {
  const c = await caches.open(LIBS);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') c.put(req, res.clone());
  return res;
}

/* map tiles: show the saved tile at once, refresh it in the background */
async function tiles(req) {
  const c = await caches.open(TILES);
  const hit = await c.match(req);
  const net = fetch(req).then((res) => {
    if (res.ok || res.type === 'opaque') { c.put(req, res.clone()); trim(TILES, MAX_TILES); }
    return res;
  }).catch(() => null);
  return hit || (await net) || Response.error();
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) { e.respondWith(shell(req)); return; }
  if (/\.arcgis\.com$/.test(url.hostname) && /\/(query|FeatureServer\/\d+)\b/.test(url.pathname) && !/\/tile\//.test(url.pathname)) {
    e.respondWith(arcgis(req)); return;
  }
  if (url.hostname === 'server.arcgisonline.com' || /\/tile\//.test(url.pathname)) { e.respondWith(tiles(req)); return; }
  if (['cdnjs.cloudflare.com', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) { e.respondWith(libs(req)); return; }
});
