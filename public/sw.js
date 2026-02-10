const CACHE_NAME = 'martin-os-v4-offline-first';
const RUNTIME_CACHE = 'martin-os-runtime-v4';

// Assets to cache immediately
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/martin-logo.png'
];

// Install event - cache core assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching core assets');
        return cache.addAll(CORE_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== RUNTIME_CACHE)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - Offline-First strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests (except for specific CDNs)
  if (url.origin !== location.origin) {
    // Only cache specific external resources if needed
    return;
  }

  // For navigation requests (HTML pages)
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match(request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            // Return cached version immediately
            return cachedResponse;
          }
          // Fetch from network and cache it
          return fetch(request).then((response) => {
            return caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, response.clone());
              return response;
            });
          });
        })
        .catch(() => {
          // If offline and no cache, return offline page
          return caches.match('/index.html');
        })
    );
    return;
  }

  // For API requests - Network First (with offline fallback)
  if (url.pathname.includes('/rest/v1/') || url.pathname.includes('/auth/v1/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clone the response before caching
          const responseToCache = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseToCache);
          });
          return response;
        })
        .catch(() => {
          // If network fails, try cache (though API responses are usually not cached)
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Return a custom offline response for API calls
            return new Response(
              JSON.stringify({ 
                error: 'Offline', 
                message: 'You are offline. Changes will sync when connection is restored.' 
              }),
              {
                status: 503,
                statusText: 'Service Unavailable',
                headers: new Headers({
                  'Content-Type': 'application/json',
                }),
              }
            );
          });
        })
    );
    return;
  }

  // For static assets (JS, CSS, images) - Cache First
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        // Not in cache, fetch from network and cache it
        return fetch(request).then((response) => {
          // Only cache successful responses
          if (response.status === 200) {
            const responseToCache = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return response;
        });
      })
      .catch(() => {
        // If both cache and network fail, return a fallback
        console.error('[SW] Failed to fetch:', request.url);
        return new Response('Offline', { status: 503 });
      })
  );
});

// Background sync event
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);
  if (event.tag === 'sync-data') {
    event.waitUntil(syncOfflineData());
  }
});

// Sync offline data function
async function syncOfflineData() {
  console.log('[SW] Syncing offline data...');
  // Send message to all clients to trigger sync
  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage({ type: 'SYNC_OFFLINE_DATA' });
  });
}

// Listen for messages from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(RUNTIME_CACHE).then((cache) => {
        return cache.addAll(event.data.urls);
      })
    );
  }
});

console.log('[SW] Service Worker loaded and ready!');
