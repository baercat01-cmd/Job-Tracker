const CACHE = 'martin-v306';
const ASSETS = ['/', '/index.html', '/manifest.json', '/martin-logo.png', 'https://cdn.tailwindcss.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => k !== CACHE && caches.delete(k)))));
  return self.clients.claim();
});

// MANDATORY FETCH HANDLER FOR INSTALLATION
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then(res => res || fetch(event.request))
  );
});
