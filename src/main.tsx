import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initDB } from './lib/offline-db';
import { initializeOfflineManager } from './lib/offline-manager';

// Initialize error handling and stress testing
import './lib/error-handler';
import './lib/stress-test';

const APP_VERSION = '2.0.7';
console.log(`🚀 FieldTrack Pro v${APP_VERSION} (PWA) - Starting...`);
console.log('📱 Offline support enabled');

// Preload critical assets into cache for offline use
if ('serviceWorker' in navigator && 'caches' in window) {
  window.addEventListener('load', () => {
    // Get all script and stylesheet elements
    const scripts = Array.from(document.querySelectorAll('script[src]'));
    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
    
    const urlsToCache = [
      ...scripts.map((s: any) => s.src),
      ...styles.map((s: any) => s.href)
    ].filter((url) => url && url.startsWith(window.location.origin));

    if (urlsToCache.length > 0) {
      caches.open('martin-os-runtime-v6.0.0').then((cache) => {
        console.log('📦 Preloading assets for offline:', urlsToCache.length);
        urlsToCache.forEach((url) => {
          cache.add(url).catch((err) => {
            console.warn('Failed to cache:', url, err);
          });
        });
      });
    }
  });
}

// Register Service Worker for PWA functionality with auto-update
if ('serviceWorker' in navigator) {
  let updateBanner: HTMLElement | null = null;

  // Create update banner (hidden by default)
  function showUpdateBanner() {
    if (updateBanner) return; // Already showing

    updateBanner = document.createElement('div');
    updateBanner.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
      color: white;
      padding: 16px;
      text-align: center;
      z-index: 99999;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    `;
    updateBanner.innerHTML = `
      <div style="max-width: 600px; margin: 0 auto; display: flex; align-items: center; justify-content: center; gap: 16px; flex-wrap: wrap;">
        <span style="font-weight: 600; font-size: 15px;">🎉 New version available!</span>
        <button onclick="window.location.reload()" style="
          background: white;
          color: #16a34a;
          border: none;
          padding: 8px 24px;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          font-size: 14px;
          transition: transform 0.2s;
        " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
          Refresh Now
        </button>
      </div>
    `;
    document.body.prepend(updateBanner);
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('✅ Service Worker registered:', registration.scope);
        console.log('🎯 PWA Mode: Auto-updates enabled');
        
        // Check for updates every 30 seconds (no console spam)
        setInterval(() => registration.update(), 30000);
        
        // Also check for updates when page becomes visible
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) registration.update();
        });
        
        // Handle service worker updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          console.log('🔄 Update found! Installing new version...');
          
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                  // New SW installed, show update banner
                  console.log('✅ New version ready! Showing update banner.');
                  showUpdateBanner();
                } else {
                  // First install
                  console.log('✅ App installed and ready!');
                }
              }
              if (newWorker.state === 'activated') {
                console.log('✅ New version activated!');
              }
            });
          }
        });
      })
      .catch((error) => {
        console.error('❌ Service Worker registration failed:', error);
      });
  });
  
  // Listen for messages from service worker
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SW_UPDATED') {
      console.log('📣 Service Worker updated to:', event.data.version);
      showUpdateBanner();
    }
    if (event.data && event.data.type === 'SYNC_OFFLINE_DATA') {
      console.log('📡 Background sync triggered');
    }
  });
  
  // Handle controller change (new SW took over)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('🔄 Controller changed - new SW active');
    // Reload the page to get the latest version
    if (!window.location.pathname.includes('login')) {
      window.location.reload();
    }
  });
}

// Request persistent storage to prevent data deletion
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().then((persistent) => {
    if (persistent) {
      console.log('✅ Persistent storage granted - your data is safe!');
    } else {
      console.warn('⚠️ Persistent storage denied - data may be cleared when storage is low');
    }
  });
}

// Check storage quota
if (navigator.storage && navigator.storage.estimate) {
  navigator.storage.estimate().then(({ usage, quota }) => {
    const percentUsed = ((usage || 0) / (quota || 1)) * 100;
    console.log(`💾 Storage: ${Math.round(percentUsed)}% used (${Math.round((usage || 0) / 1024 / 1024)}MB / ${Math.round((quota || 0) / 1024 / 1024)}MB)`);
  });
}

// Initialize IndexedDB and Offline Manager
Promise.all([
  initDB(),
  Promise.resolve(initializeOfflineManager())
])
  .then(() => {
    console.log('✅ [IndexedDB] Initialized successfully');
    console.log('✅ [OfflineManager] Initialized successfully');
    console.log('📦 Offline-First mode: Data persists locally and syncs when online');
    console.log('🔄 Auto-sync enabled: Changes sync automatically when connection is available');
  })
  .catch((error) => {
    console.error('❌ Initialization failed:', error);
  });

// Verify React is loaded correctly
if (!StrictMode || !createRoot) {
  console.error('❌ React modules failed to load!');
  document.getElementById('root')!.innerHTML = `
    <div style="text-align: center; padding: 50px; font-family: sans-serif;">
      <h1>Loading Error</h1>
      <p>React failed to load. Please clear your browser cache and reload.</p>
      <button onclick="location.reload(true)" style="padding: 10px 20px; margin-top: 20px; cursor: pointer;">
        Force Reload
      </button>
    </div>
  `;
} else {
  console.log('✅ React loaded successfully');
  
  try {
    const root = createRoot(document.getElementById('root')!);
    root.render(
      <StrictMode>
        <App />
      </StrictMode>
    );
    console.log('✅ App mounted successfully');
  } catch (error) {
    console.error('❌ Failed to mount app:', error);
    document.getElementById('root')!.innerHTML = `
      <div style="text-align: center; padding: 50px; font-family: sans-serif;">
        <h1>App Error</h1>
        <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
        <button onclick="localStorage.clear(); sessionStorage.clear(); location.reload(true);" 
                style="padding: 10px 20px; margin-top: 20px; cursor: pointer;">
          Clear Cache & Reload
        </button>
      </div>
    `;
  }
}
