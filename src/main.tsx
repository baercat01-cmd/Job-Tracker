import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

console.log('🚀 FieldTrack Pro v2.0.4 - Starting...');
console.log('👤 Simple user selection enabled - no authentication required');

// COMPLETELY DISABLE SERVICE WORKER to fix caching issues
// Unregister all existing service workers on every load
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      console.log('🧹 [Main] Unregistering service worker');
      registration.unregister();
    });
  });
}

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
