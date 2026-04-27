# PWA (Progressive Web App) Setup Guide

## ✅ What's Already Configured

Your Martin Builder OS app is now a fully-featured Progressive Web App with:

### 1. **Manifest File** (`public/manifest.json`)
- ✅ App name, icons, and branding
- ✅ Standalone display mode (looks like native app)
- ✅ App shortcuts for quick access
- ✅ Categories and descriptions

### 2. **Service Worker** (`public/sw.js`)
- ✅ Offline caching for app shell (HTML, CSS, JS)
- ✅ Image caching with expiration
- ✅ Network-first strategy for dynamic content
- ✅ Cache-first strategy for static assets
- ✅ Background sync support
- ✅ Push notification handlers (ready for future use)

### 3. **Offline Features**
- ✅ IndexedDB for offline data storage
- ✅ Photo queue for offline uploads
- ✅ Time entries saved offline
- ✅ Daily logs cached locally
- ✅ Automatic sync when connection restored

### 4. **Mobile Optimizations**
- ✅ Touch-optimized UI
- ✅ Prevent double-tap zoom
- ✅ Responsive design for all screen sizes
- ✅ Fast loading with code splitting

## 📱 Installing on Android

### Method 1: Chrome Browser (Recommended)
1. Open the app in Chrome browser
2. Look for the install prompt that appears automatically
3. Tap "Install App" or "Add to Home Screen"
4. The app will be added to your home screen and app drawer
5. It will work like a native Android app!

### Method 2: Manual Installation
1. Open the app in Chrome
2. Tap the **three dots menu** (⋮) in top-right
3. Select **"Add to Home screen"** or **"Install app"**
4. Enter a name (default: FieldTrack)
5. Tap **"Add"** or **"Install"**

### Method 3: From Chrome Menu
1. Chrome → Settings → Add to Home screen
2. Follow the prompts

## 🎯 Features When Installed

Once installed on Android, users get:

### Native-Like Experience
- ✅ App appears in app drawer and home screen
- ✅ Full-screen mode (no browser UI)
- ✅ Appears in recent apps / task switcher
- ✅ Can be launched from launcher
- ✅ Custom splash screen with your logo

### Offline Capabilities
- ✅ **Clock In/Out** - Works completely offline
- ✅ **Time Tracking** - All timer data saved locally
- ✅ **Daily Logs** - Create logs offline, sync later
- ✅ **Photos** - Queue photos for upload when online
- ✅ **View Jobs** - Cached job data available offline
- ✅ **Materials List** - View materials offline

### Performance
- ✅ Instant loading (cached app shell)
- ✅ Faster navigation
- ✅ Reduced data usage
- ✅ Background sync when connection restored

## 🔧 Developer Notes

### Service Worker Caching Strategy

1. **Static Assets (App Shell)**
   - Strategy: Cache-first with background update
   - Includes: HTML, CSS, JavaScript, fonts
   - Always available offline

2. **Images**
   - Strategy: Cache-first with 7-day expiration
   - Includes: Logos, photos, icons
   - Stale-while-revalidate approach

3. **API Calls (Supabase)**
   - Handled by IndexedDB, not service worker
   - Automatic sync queue
   - Conflict resolution built-in

### Cache Management

The app automatically:
- Clears old caches on updates
- Maintains 3 separate caches:
  - `fieldtrack-v2.0.5` - Static app shell
  - `fieldtrack-runtime-v2.0.5` - Dynamic content
  - `fieldtrack-images-v2.0.5` - Image cache

### Version Updates

When you deploy a new version:
1. Service worker detects the update
2. Prompts user to reload
3. New version installs in background
4. Old caches are cleared automatically

### Testing PWA Features

#### Test Install Prompt
```javascript
// In browser console
localStorage.removeItem('pwa_install_dismissed');
// Reload page to see install prompt again
```

#### Test Offline Mode
1. Chrome DevTools → Application → Service Workers
2. Check "Offline" checkbox
3. Reload page - should still work!

#### Test Cache
```javascript
// Check what's cached
caches.keys().then(console.log);

// View cache contents
caches.open('fieldtrack-v2.0.5').then(cache => {
  cache.keys().then(console.log);
});
```

#### Clear All Caches (for testing)
```javascript
caches.keys().then(keys => {
  keys.forEach(key => caches.delete(key));
});
```

## 📊 PWA Checklist

- ✅ HTTPS (required for PWA)
- ✅ Valid manifest.json
- ✅ Service worker registered
- ✅ Offline page/functionality
- ✅ Fast loading (< 3s)
- ✅ Mobile responsive
- ✅ 192px and 512px icons
- ✅ Standalone display mode
- ✅ Theme color set
- ✅ Install prompt implemented

## 🚀 Future Enhancements

Consider adding:
- [ ] Push notifications for job updates
- [ ] Badge API for unread counts
- [ ] Web Share API for sharing logs
- [ ] File System Access API for exports
- [ ] Geolocation API for automatic clock-in
- [ ] Background Fetch for large files

## 🐛 Troubleshooting

### Install Prompt Not Showing
- Check: HTTPS enabled
- Check: Valid manifest.json
- Check: Service worker registered
- Clear: `localStorage.removeItem('pwa_install_dismissed')`

### App Not Working Offline
- Check: Service worker status in DevTools
- Check: IndexedDB has data
- Clear cache and reload

### Updates Not Applying
- Hard reload: Ctrl+Shift+R (or Cmd+Shift+R)
- Clear cache in DevTools
- Unregister service worker and refresh

### Icons Not Displaying
- Check image URLs are accessible
- Ensure icons are served over HTTPS
- Verify icon sizes match manifest

## 📱 Testing Tools

### Chrome DevTools
- Application → Manifest
- Application → Service Workers
- Application → Cache Storage
- Application → IndexedDB
- Lighthouse → PWA audit

### Online Tools
- [PWA Builder](https://www.pwabuilder.com/)
- [Lighthouse CI](https://web.dev/measure/)
- [Web.dev PWA Checklist](https://web.dev/pwa-checklist/)

## 🎨 Customization

### Change App Colors
Edit `public/manifest.json`:
```json
"theme_color": "#22c55e",  // Browser address bar color
"background_color": "#ffffff"  // Splash screen background
```

### Update App Icons
Replace icons in manifest with your own:
- 192x192px for mobile
- 512x512px for desktop
- Maskable icon for adaptive icons

### Modify Cache Duration
Edit `public/sw.js`:
```javascript
const IMAGE_CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
```

## 📖 Resources

- [MDN PWA Guide](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
- [Google PWA Docs](https://web.dev/progressive-web-apps/)
- [Service Worker Cookbook](https://serviceworke.rs/)
- [Workbox (Google's SW Library)](https://developers.google.com/web/tools/workbox)

---

**Your app is now a full-featured PWA ready for Android installation!** 🎉

Users can install it directly from their browser without needing the Play Store, and it will work offline with automatic syncing when connection is restored.
