// VERSION - INCREMENT THIS TO FORCE UPDATES
const VERSION = 'v6.0.0';
const CACHE_NAME = `martin-os-${VERSION}`;
const RUNTIME_CACHE = `martin-os-runtime-${VERSION}`;

// Essential assets to cache immediately (minimal for faster install)
const CORE_ASSETS = [
  '/index.html',
  '/manifest.json'
];

// Assets that should NOT be cached
const CACHE_BLACKLIST = [
  '/hot',
  '/@vite',
  '/@fs',
  '/node_modules',
  '/sw.js'
];

// Install event - cache core assets and skip waiting
self.addEventListener('install', (event) => {
  console.log(`[SW ${VERSION}] Installing new service worker...`);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log(`[SW ${VERSION}] Caching core assets`);
        // Cache core assets with error handling
        return Promise.all(
          CORE_ASSETS.map((url) => {
            return cache.add(url).catch((err) => {
              console.warn(`[SW ${VERSION}] Failed to cache ${url}:`, err);
            });
          })
        );
      })
      .then(() => {
        console.log(`[SW ${VERSION}] Skip waiting - activating immediately`);
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error(`[SW ${VERSION}] Install failed:`, error);
      })
  );
});

// Activate event - clean up old caches and take control immediately
self.addEventListener('activate', (event) => {
  console.log(`[SW ${VERSION}] Activating service worker...`);
  event.waitUntil(
    Promise.all([
      // Delete old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME && name !== RUNTIME_CACHE)
            .map((name) => {
              console.log(`[SW ${VERSION}] Deleting old cache:`, name);
              return caches.delete(name);
            })
        );
      }),
      // Take control of all clients immediately
      self.clients.claim()
    ]).then(() => {
      console.log(`[SW ${VERSION}] Activated and claimed all clients`);
      // Notify all clients about the update
      return self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ 
            type: 'SW_UPDATED', 
            version: VERSION 
          });
        });
      });
    })
  );
});

// Helper function to check if URL should be cached
function shouldCache(url) {
  // Don't cache blacklisted paths
  for (const blacklisted of CACHE_BLACKLIST) {
    if (url.pathname.includes(blacklisted)) {
      return false;
    }
  }
  return true;
}

// Fetch event - Offline-First strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // Skip blacklisted paths
  if (!shouldCache(url)) {
    return;
  }

  // For navigation requests (HTML pages) - CACHE FIRST for offline support
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match(request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            console.log(`[SW ${VERSION}] Serving cached navigation:`, url.pathname);
            // Update cache in background
            fetch(request)
              .then((response) => {
                if (response && response.status === 200) {
                  caches.open(CACHE_NAME).then((cache) => {
                    cache.put(request, response.clone());
                  });
                }
              })
              .catch(() => {});
            return cachedResponse;
          }
          
          // Not in cache, fetch from network
          return fetch(request)
            .then((response) => {
              if (response && response.status === 200) {
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(request, responseToCache);
                });
              }
              return response;
            })
            .catch(() => {
              // If both cache and network fail, return fallback
              return caches.match('/index.html');
            });
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

  // For static assets (JS, CSS, images, fonts) - CACHE FIRST for offline support
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          console.log(`[SW ${VERSION}] Serving cached asset:`, url.pathname);
          // Update cache in background for non-critical assets
          if (!url.pathname.endsWith('.js') && !url.pathname.endsWith('.css')) {
            fetch(request)
              .then((response) => {
                if (response && response.status === 200) {
                  caches.open(RUNTIME_CACHE).then((cache) => {
                    cache.put(request, response.clone());
                  });
                }
              })
              .catch(() => {});
          }
          return cachedResponse;
        }
        
        // Not in cache, fetch from network and cache it
        console.log(`[SW ${VERSION}] Fetching and caching:`, url.pathname);
        return fetch(request)
          .then((response) => {
            // Only cache successful responses
            if (response && response.status === 200) {
              const responseToCache = response.clone();
              caches.open(RUNTIME_CACHE).then((cache) => {
                cache.put(request, responseToCache);
              });
            }
            return response;
          })
          .catch((error) => {
            console.error(`[SW ${VERSION}] Failed to fetch:`, request.url, error);
            // Return a basic offline response
            return new Response('Offline - Asset not cached', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({
                'Content-Type': 'text/plain',
              }),
            });
          });
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

console.log(`[SW ${VERSION}] Service Worker loaded and ready!`);
