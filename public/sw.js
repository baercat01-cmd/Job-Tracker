const CACHE_NAME = 'martin-v301-assets';
const DATA_CACHE = 'martin-material-data';
const ASSETS = [
  '/', 
  '/index.html', 
  '/manifest.json', 
  '/martin-logo.png', 
  'https://cdn.tailwindcss.com', 
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => {
        if (key !== CACHE_NAME && key !== DATA_CACHE) return caches.delete(key);
      }));
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Data Caching (Supabase/API)
  if (url.hostname.includes('supabase.co') || url.hostname.includes('backend.onspace.ai') || event.request.headers.get('accept')?.includes('json')) {
    event.respondWith(
      caches.open(DATA_CACHE).then(cache => 
        cache.match(event.request).then(cached => {
          const networked = fetch(event.request).then(res => {
            cache.put(event.request, res.clone());
            return res;
          }).catch(() => null);
          return cached || networked;
        })
      )
    );
    return;
  }
  
  // Static Asset Caching
  event.respondWith(caches.match(event.request).then(res => res || fetch(event.request)));
});
