import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initDB } from './lib/offline-db';

// Initialize error handling and stress testing
import './lib/error-handler';
import './lib/stress-test';

console.log('🚀 FieldTrack Pro v2.0.5 (PWA) - Starting...');
console.log('📱 Offline support enabled');

// Register Service Worker for PWA functionality
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('✅ Service Worker registered successfully:', registration.scope);
        console.log('🎯 PWA Mode: App can be installed and works offline');
        
        // Check for updates every 60 seconds
        setInterval(() => {
          registration.update();
        }, 60000);
        
        // Handle service worker updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New service worker available, notify user
                console.log('🔄 New version available! Prompting user to update.');
                if (confirm('A new version of FieldTrack is available. Reload to update?')) {
                  newWorker.postMessage({ type: 'SKIP_WAITING' });
                  window.location.reload();
                }
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
    if (event.data && event.data.type === 'SYNC_OFFLINE_DATA') {
      console.log('📡 Background sync triggered');
      // Trigger offline data sync here if needed
    }
  });
}

// Initialize IndexedDB
initDB()
  .then(() => {
    console.log('[IndexedDB] Initialized successfully');
  })
  .catch((error) => {
    console.error('[IndexedDB] Initialization failed:', error);
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
