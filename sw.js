// Network first, the cache as the fallback: a deploy shows up on the next
// load, and once the game has been opened it also opens offline.
// ponytail: a hand-kept list; a new module that is missing here still works
// online and is cached on its first fetch, but is absent offline until then.
const CACHE = 'vertice-1';
const CORE = [
  './', 'index.html', 'style.css', 'manifest.webmanifest', 'icons/icon.svg',
  'vendor/three.module.js', 'vendor/rive/rive.js', 'vendor/rive/rive.wasm', 'assets/hint.riv',
  'src/main.js', 'src/palette.js', 'src/ui/HUDManager.js', 'src/ui/hint.js',
  'src/engine/AudioEngine.js', 'src/engine/ParticleSystem.js', 'src/engine/Renderer.js',
  'src/game/LevelSystem.js', 'src/game/Player.js', 'src/game/ScoreSystem.js', 'src/game/WallManager.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('vertice-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  e.respondWith(fetch(request).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy));
    }
    return res;
  }).catch(() => caches.match(request, { ignoreSearch: true }).then((hit) => hit ?? Response.error())));
});
