// Service Worker for FieldTrack Pro
// Provides offline support and caching

const CACHE_VERSION = 'v2.0.5';
const CACHE_NAME = `fieldtrack-${CACHE_VERSION}`;
const RUNTIME_CACHE = `fieldtrack-runtime-${CACHE_VERSION}`;
const IMAGE_CACHE = `fieldtrack-images-${CACHE_VERSION}`;

// Resources to cache for offline use
const STATIC_CACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// CDN resources to cache for offline field use
const CDN_CACHE_URLS = [
  'https://unpkg.com/three@0.160.0/build/three.module.js',
  'https://unpkg.com/@react-three/fiber@8.15.16/dist/index.js',
  'https://unpkg.com/@react-three/drei@9.96.1/dist/index.js',
  'https://cdn.tailwindcss.com/3.4.11',
];

// Cache duration (7 days for images)
const IMAGE_CACHE_DURATION = 7 * 24 * 60 * 60 * 1000;

// Install event - cache static resources
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing v' + CACHE_VERSION);
  
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then((cache) => {
        console.log('[Service Worker] Caching static resources');
        return cache.addAll(STATIC_CACHE_URLS).catch(err => {
          console.warn('[Service Worker] Failed to cache some resources:', err);
        });
      }),
      caches.open('cdn-cache').then((cache) => {
        console.log('[Service Worker] Caching CDN resources for offline field use');
        return cache.addAll(CDN_CACHE_URLS).catch(err => {
          console.warn('[Service Worker] Failed to cache CDN resources:', err);
        });
      })
    ]).then(() => {
      // Activate immediately
      return self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating v' + CACHE_VERSION);
  
  const currentCaches = [CACHE_NAME, RUNTIME_CACHE, IMAGE_CACHE, 'cdn-cache'];
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!currentCaches.includes(cacheName)) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Take control of all clients immediately
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle CDN resources with cache-first strategy
  if (url.hostname.includes('unpkg.com') || url.hostname.includes('cdn.tailwindcss.com')) {
    event.respondWith(
      caches.open('cdn-cache').then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(request).then((response) => {
            if (response && response.status === 200) {
              cache.put(request, response.clone());
            }
            return response;
          }).catch(() => {
            return new Response('CDN resource unavailable offline', { status: 503 });
          });
        });
      })
    );
    return;
  }

  // Skip other cross-origin requests except for CDN images
  if (url.origin !== location.origin && !url.hostname.includes('cdn-ai.onspace.ai')) {
    return;
  }

  // Skip Supabase API calls (they'll be handled by IndexedDB)
  if (url.hostname.includes('supabase.co')) {
    return;
  }

  // Handle image requests with dedicated cache
  if (request.destination === 'image' || request.url.match(/\.(png|jpg|jpeg|svg|gif|webp|ico)$/i)) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          // Return cached version if available and fresh
          if (cachedResponse) {
            const dateHeader = cachedResponse.headers.get('date');
            const cachedTime = dateHeader ? new Date(dateHeader).getTime() : 0;
            if (Date.now() - cachedTime < IMAGE_CACHE_DURATION) {
              return cachedResponse;
            }
          }

          // Fetch from network and update cache
          return fetch(request).then((response) => {
            if (response && response.status === 200) {
              cache.put(request, response.clone());
            }
            return response;
          }).catch(() => {
            // Return cached version even if expired when offline
            return cachedResponse || new Response('Image unavailable offline', { status: 503 });
          });
        });
      })
    );
    return;
  }

  // Handle HTML, JS, CSS with cache-first strategy for app shell
  if (request.destination === 'document' || 
      request.url.endsWith('.js') || 
      request.url.endsWith('.css') ||
      request.url.endsWith('.json')) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // Return cached version immediately
          // Update cache in background
          fetch(request).then((response) => {
            if (response && response.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, response);
              });
            }
          }).catch(() => {});
          
          return cachedResponse;
        }

        // Not in cache, fetch from network
        return fetch(request).then((response) => {
          if (!response || response.status !== 200) {
            return response;
          }

          // Cache successful responses
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });

          return response;
        }).catch(() => {
          // Network failed, return app shell for HTML
          if (request.destination === 'document') {
            return caches.match('/index.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
    );
    return;
  }

  // For other requests, network-first with cache fallback
  event.respondWith(
    fetch(request).then((response) => {
      if (response && response.status === 200 && request.method === 'GET') {
        const responseToCache = response.clone();
        caches.open(RUNTIME_CACHE).then((cache) => {
          cache.put(request, responseToCache);
        });
      }
      return response;
    }).catch(() => {
      return caches.match(request).then((cachedResponse) => {
        return cachedResponse || new Response('Offline', { status: 503 });
      });
    })
  );
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Background sync:', event.tag);
  
  if (event.tag === 'sync-offline-data') {
    event.waitUntil(
      // Notify clients to sync offline data
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'SYNC_OFFLINE_DATA'
          });
        });
      })
    );
  }
});

// Message handler for communication with clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_VERSION });
  }
});

// Push notification handler (for future use)
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push received');
  
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'FieldTrack Pro';
  const options = {
    body: data.body || 'New notification',
    icon: 'https://cdn-ai.onspace.ai/onspace/files/EvPiYskzE4vCidikEdjr5Z/MB_Logo_Green_192x64_12.9kb.png',
    badge: 'https://cdn-ai.onspace.ai/onspace/files/EvPiYskzE4vCidikEdjr5Z/MB_Logo_Green_192x64_12.9kb.png',
    vibrate: [200, 100, 200],
    data: data.data || {}
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification clicked');
  
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});
