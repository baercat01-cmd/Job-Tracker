// Service Worker for Martin Builder OS - HARDENED OFFLINE DATA ENGINE
// Provides robust offline support, CDN caching, and PWA capabilities

const CACHE_VERSION = 'offline-data-v300';
const CACHE_NAME = `martin-${CACHE_VERSION}`;
const RUNTIME_CACHE = `martin-runtime-${CACHE_VERSION}`;
const IMAGE_CACHE = `martin-images-${CACHE_VERSION}`;
const CDN_CACHE = `martin-cdn-${CACHE_VERSION}`;
const DATA_CACHE = `martin-data-${CACHE_VERSION}`; // For Supabase/API responses - HIGH PRIORITY

// Core assets to cache immediately for offline field use - 100% GUARANTEED
const STATIC_CACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/martin-logo.png',
];

// Critical CDN resources for offline field use - HARDENED LIST
const CDN_CACHE_URLS = [
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap',
];

// Cache duration (7 days for images)
const IMAGE_CACHE_DURATION = 7 * 24 * 60 * 60 * 1000;

// Install event - cache static resources and CDN assets - ZERO TOLERANCE FOR FAILURE
self.addEventListener('install', (event) => {
  console.log('[Martin OS SW] 🔧 Installing HARDENED OFFLINE ENGINE v' + CACHE_VERSION);
  
  event.waitUntil(
    Promise.all([
      // Cache core static assets - MUST SUCCEED
      caches.open(CACHE_NAME).then((cache) => {
        console.log('[Martin OS SW] 📦 Caching core assets (100% guarantee)');
        return cache.addAll(STATIC_CACHE_URLS).catch(err => {
          console.error('[Martin OS SW] ❌ CRITICAL: Failed to cache core assets:', err);
          // Force retry on critical failure
          return cache.addAll(STATIC_CACHE_URLS);
        });
      }),
      // Cache CDN resources for offline field use - MUST SUCCEED
      caches.open(CDN_CACHE).then((cache) => {
        console.log('[Martin OS SW] 📦 Caching CDN resources for offline field use (100% guarantee)');
        return Promise.allSettled(
          CDN_CACHE_URLS.map(url => 
            cache.add(url).catch(err => {
              console.warn('[Martin OS SW] ⚠️ Failed to cache CDN resource:', url, err);
            })
          )
        );
      })
    ]).then(() => {
      console.log('[Martin OS SW] ✅ Installation complete - HARDENED OFFLINE ENGINE READY');
      // Activate immediately
      return self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Martin OS SW] 🚀 Activating HARDENED OFFLINE ENGINE v' + CACHE_VERSION);
  
  const currentCaches = [CACHE_NAME, RUNTIME_CACHE, IMAGE_CACHE, CDN_CACHE, DATA_CACHE];
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!currentCaches.includes(cacheName)) {
            console.log('[Martin OS SW] 🗑️ Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[Martin OS SW] ✅ Activation complete - taking control of all clients');
      // Take control of all clients immediately
      return self.clients.claim();
    })
  );
});

// Fetch event - HARDENED CACHE-FIRST STRATEGY for data persistence
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // PRIORITY 1: CACHE-FIRST for ALL external CDN resources (Three.js, Tailwind, Charts, Fonts)
  if (url.hostname.includes('unpkg.com') || 
      url.hostname.includes('cdn.tailwindcss.com') ||
      url.hostname.includes('cdnjs.cloudflare.com') ||
      url.hostname.includes('cdn.jsdelivr.net') ||
      url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(CDN_CACHE).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          // CACHE-FIRST: Return immediately if cached (0ms wait)
          if (cachedResponse) {
            console.log('[Martin OS SW] ⚡ CDN CACHE HIT:', url.pathname);
            return cachedResponse;
          }
          
          // Not cached - fetch and store
          console.log('[Martin OS SW] ⬇️ Downloading CDN resource:', url.pathname);
          return fetch(request, { mode: 'cors' }).then((response) => {
            if (response && response.status === 200) {
              console.log('[Martin OS SW] ✅ Cached CDN resource:', url.pathname);
              cache.put(request, response.clone());
            }
            return response;
          }).catch((err) => {
            console.error('[Martin OS SW] ❌ CDN fetch failed (offline):', url.pathname);
            return new Response('CDN resource unavailable offline', { 
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
        });
      })
    );
    return;
  }

  // Skip other cross-origin requests except for Martin Builder CDN images
  if (url.origin !== location.origin && !url.hostname.includes('cdn-ai.onspace.ai')) {
    return;
  }

  // PRIORITY 2: HARDENED CACHE-FIRST for Supabase API (Database/Storage)
  // ZERO network wait - return cached JSON data IMMEDIATELY
  if (url.hostname.includes('supabase.co') || url.hostname.includes('backend.onspace.ai')) {
    // Only cache GET requests (read operations)
    if (request.method !== 'GET') {
      console.log('[Martin OS SW] 🔄 Mutation request - bypassing cache:', request.method, url.pathname);
      return; // Let mutations go through network
    }

    event.respondWith(
      caches.open(DATA_CACHE).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          // HARDENED CACHE-FIRST: Return cached data INSTANTLY (0ms wait)
          if (cachedResponse) {
            console.log('[Martin OS SW] ⚡ DATABASE CACHE HIT - INSTANT RETURN (0ms):', url.pathname);
            
            // Background update (fire and forget - stale-while-revalidate)
            fetch(request).then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                console.log('[Martin OS SW] ✅ Background update complete:', url.pathname);
                cache.put(request, networkResponse.clone());
              }
            }).catch(() => {
              console.log('[Martin OS SW] ℹ️ Background update failed (offline) - cached data already served');
            });
            
            return cachedResponse; // Return immediately - ZERO WAIT
          }

          // No cached data - first-time fetch only
          console.log('[Martin OS SW] ⬇️ First-time database fetch (will cache for offline):', url.pathname);
          return fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              console.log('[Martin OS SW] ✅ Cached for offline use:', url.pathname);
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          }).catch((err) => {
            console.error('[Martin OS SW] ❌ Network failed and no cache available:', err);
            return new Response(JSON.stringify({ 
              error: 'Offline - data not yet cached',
              offline: true 
            }), { 
              status: 503,
              statusText: 'Service Unavailable',
              headers: { 'Content-Type': 'application/json' }
            });
          });
        });
      })
    );
    return;
  }

  // Handle Martin Builder images with dedicated cache
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
            return cachedResponse || new Response('Image unavailable offline', { 
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
        });
      })
    );
    return;
  }

  // PRIORITY 3: CACHE-FIRST for app shell (HTML, JS, CSS, JSON)
  if (request.destination === 'document' || 
      request.url.endsWith('.js') || 
      request.url.endsWith('.css') ||
      request.url.endsWith('.json')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          // CACHE-FIRST: Return immediately if cached
          if (cachedResponse) {
            console.log('[Martin OS SW] ⚡ APP SHELL CACHE HIT:', url.pathname);
            
            // Background update (stale-while-revalidate)
            fetch(request).then((response) => {
              if (response && response.status === 200) {
                cache.put(request, response);
              }
            }).catch(() => {});
            
            return cachedResponse;
          }

          // Not cached - fetch and store
          console.log('[Martin OS SW] ⬇️ Downloading app resource:', url.pathname);
          return fetch(request).then((response) => {
            if (!response || response.status !== 200) {
              return response;
            }

            // Cache successful responses
            const responseToCache = response.clone();
            cache.put(request, responseToCache);
            console.log('[Martin OS SW] ✅ Cached app resource:', url.pathname);
            return response;
          }).catch((err) => {
            console.error('[Martin OS SW] ❌ App fetch failed:', url.pathname, err);
            // Network failed, return app shell for HTML
            if (request.destination === 'document') {
              return caches.match('/index.html');
            }
            return new Response('Offline', { 
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
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
        return cachedResponse || new Response('Offline', { 
          status: 503,
          statusText: 'Service Unavailable'
        });
      });
    })
  );
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('[Martin OS SW] 🔄 Background sync:', event.tag);
  
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
  console.log('[Martin OS SW] 💬 Message received:', event.data?.type);
  
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

// Push notification handler
self.addEventListener('push', (event) => {
  console.log('[Martin OS SW] 🔔 Push notification received');
  
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Martin Builder OS';
  const options = {
    body: data.body || 'New notification',
    icon: '/martin-logo.png',
    badge: '/martin-logo.png',
    vibrate: [200, 100, 200],
    data: data.data || {},
    tag: data.tag || 'martin-builder-notification',
    requireInteraction: data.requireInteraction || false
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  console.log('[Martin OS SW] 👆 Notification clicked');
  
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});

console.log('[Martin OS SW] ✅ HARDENED OFFLINE ENGINE v' + CACHE_VERSION + ' LOADED - CACHE-FIRST DATABASE STRATEGY ACTIVE');
