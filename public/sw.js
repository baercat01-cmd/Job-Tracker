const CACHE_NAME = 'martin-v301-hardened';
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

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Intercept Data/API calls for the Material Database
  if (url.hostname.includes('supabase.co') || url.hostname.includes('backend.onspace.ai') || event.request.headers.get('accept')?.includes('json')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => 
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
  
  event.respondWith(caches.match(event.request).then(res => res || fetch(event.request)));
});
