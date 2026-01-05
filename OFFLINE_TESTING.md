# Offline Functionality Testing Guide

## Overview
This guide provides comprehensive testing procedures for the offline capabilities of FieldTrack Pro.

## Prerequisites
- Chrome/Edge DevTools (F12)
- Test user account (foreman role recommended)
- Test job with components

## Test Scenarios

### 1. Connection Status Monitoring

**Test Steps:**
1. Open app with DevTools (F12)
2. Go to Network tab → Check "Offline" checkbox
3. Verify connection status shows "offline" in top-right
4. Uncheck "Offline"
5. Verify status changes to "online"

**Expected Behavior:**
- Status indicator updates immediately
- Console shows: `[OfflineManager] Connection lost` and `[OfflineManager] Connection restored`

---

### 2. Offline Data Access

**Test Steps:**
1. Load app while online (all data syncs)
2. Navigate to Jobs page
3. Go offline (DevTools → Network → Offline)
4. Refresh page
5. Navigate through jobs, view details

**Expected Behavior:**
- App loads successfully offline
- All previously viewed data is visible
- Console shows: `[OfflineData] Using cached data (offline)`
- No error messages about missing data

---

### 3. Offline Time Entry Creation

**Test Steps:**
1. Go online, select a job
2. Go offline
3. Start a time entry:
   - Select component
   - Enter crew count
   - Click "Start Timer"
4. Stop timer after 30 seconds
5. Check sync status (bottom-right button)

**Expected Behavior:**
- Time entry created successfully
- Toast: "Time entry saved - will sync when online"
- Sync status shows "1 pending"
- Console: `[Mutations] ⏱ Queued create for time_entries (offline)`
- Time entry appears in list with temp ID (temp_xxxxx)

---

### 4. Offline Daily Log Creation

**Test Steps:**
1. Select a job while offline
2. Navigate to Daily Logs
3. Create new log:
   - Fill in weather
   - Add work performed notes
   - Add crew count
   - Save log

**Expected Behavior:**
- Log saved locally
- Sync status shows pending items
- Log visible in list immediately
- Console: `[Mutations] ⏱ Queued create for daily_logs`

---

### 5. Offline Photo Upload

**Test Steps:**
1. While offline, navigate to Photos
2. Click "Upload Photo"
3. Select an image file (< 5MB recommended)
4. Add caption
5. Submit

**Expected Behavior:**
- Toast: "Photo saved - will upload when online"
- Photo appears in queue
- Sync status shows photo in queue
- Console: `[Photo Queue] Photo queued for upload`

---

### 6. Automatic Sync on Reconnect

**Test Steps:**
1. Create 3 time entries while offline
2. Create 1 daily log while offline
3. Queue 2 photos while offline
4. Verify sync status shows "6 pending"
5. Go back online (uncheck Offline in DevTools)
6. Wait 5 seconds

**Expected Behavior:**
- Sync starts automatically
- Console: `[Sync Processor] Device came online, starting auto-sync...`
- Sync status shows progress bar
- Items process one by one
- Console shows: `✓ Synced insert time_entries/...`
- After completion: `[Sync Processor] Complete: X succeeded, 0 failed`
- Sync button disappears after 2 seconds
- Temp IDs replaced with real database IDs

---

### 7. Manual Sync Trigger

**Test Steps:**
1. Create items offline
2. Go online
3. Click sync status button (bottom-right)
4. Click "Sync Now"

**Expected Behavior:**
- Sync starts immediately
- Progress shown in popover
- Success message after completion

---

### 8. Offline Data Updates

**Test Steps:**
1. Create time entry while online
2. Note the time entry ID
3. Go offline
4. Edit the time entry (change crew count)
5. Save changes

**Expected Behavior:**
- Toast: "Updated - will sync when online"
- Changes visible immediately in UI
- Sync queue shows update operation
- Console: `[Mutations] ⏱ Queued update for time_entries/xxx`

---

### 9. Conflict Resolution

**Test Steps:**
1. Create time entry while online (Entry A)
2. Open app in second browser tab
3. In Tab 1: Go offline, edit Entry A (change to 5 crew)
4. In Tab 2: While online, edit Entry A (change to 3 crew)
5. In Tab 1: Go back online
6. Wait for sync

**Expected Behavior:**
- Console: `[Conflict Resolver] Conflict detected...`
- Local changes preserved (crew = 5) due to time_entries strategy
- No data loss
- Console: `[Conflict Resolver] Using local version for time_entries/xxx`

---

### 10. Photo Upload Queue Processing

**Test Steps:**
1. Go offline
2. Queue 3 photos with different jobs/dates
3. Go online
4. Open sync status popover
5. Click "Upload Photos"
6. Monitor progress

**Expected Behavior:**
- Photos upload one at a time
- Progress bar shows upload status
- Success: Photos appear in Photos view with real URLs
- Console: `[Photo Queue] Processing photo X/Y`
- Toast: "All photos uploaded successfully"

---

### 11. Failed Sync Retry

**Test Steps:**
1. Create time entry offline
2. Go online briefly (< 2 seconds)
3. Go offline again before sync completes
4. Go online again after 30 seconds

**Expected Behavior:**
- First sync attempt fails gracefully
- Console: `X items failed, will retry in 30s`
- Automatic retry after 30 seconds
- Items successfully synced on retry

---

### 12. Large Data Sync

**Test Steps:**
1. Clear browser data (to start fresh)
2. Go online
3. Load app
4. Monitor console

**Expected Behavior:**
- Console: `[Sync] Starting full sync...`
- All tables synced in order
- Console: `✓ Synced X records from jobs`
- Console: `✓ Synced X records from components`
- Console: `[Sync] Full sync complete`
- IndexedDB contains all data

---

### 13. Offline-First Performance

**Test Steps:**
1. Ensure data is cached (use app while online first)
2. Go offline
3. Measure time to load Jobs page
4. Compare to online load time

**Expected Behavior:**
- Offline load is faster (no network delay)
- Console: `[OfflineData] Using cached jobs`
- Data appears instantly

---

### 14. Service Worker Caching

**Test Steps:**
1. Load app while online
2. Go to Application tab in DevTools
3. Check "Service Workers" section
4. Verify service worker is active
5. Go to "Cache Storage"
6. Check "fieldtrack-v1" cache

**Expected Behavior:**
- Service worker shows "activated and running"
- Cache contains app resources (HTML, CSS, JS)
- Console: `[SW] Install complete`

---

### 15. Incremental Sync

**Test Steps:**
1. Use app for 10 minutes online
2. Create new job in office dashboard (different browser)
3. Wait 30 seconds
4. Check field app

**Expected Behavior:**
- New job appears automatically
- Console: `[Sync] ✓ Incremental sync: 1 records from jobs`
- No full re-sync needed

---

## Debugging Common Issues

### Issue: Sync Button Keeps Flashing
**Check:**
```javascript
// Console:
// Should NOT see rapid state updates
// Should see 30-second polling intervals
```

**Fix:** Refresh page, clear IndexedDB if needed

---

### Issue: Items Not Syncing
**Check:**
```javascript
// DevTools → Application → IndexedDB → fieldtrack_offline → sync_queue
// Verify items exist with synced: false
```

**Console Commands:**
```javascript
// Check pending items
(await import('./src/lib/offline-db')).getPendingSyncItems()

// Force sync
(await import('./src/lib/sync-processor')).processSyncQueue()
```

---

### Issue: Photos Not Uploading
**Check:**
```javascript
// DevTools → Application → IndexedDB → LocalForage → photo_upload_queue
// Verify photos exist with status: 'pending'
```

**Console Commands:**
```javascript
// Check queue
(await import('./src/lib/photo-queue')).getPhotoQueueStatus()

// Force upload
(await import('./src/lib/photo-queue')).processPhotoQueue()
```

---

### Issue: Temp IDs Not Replaced
**Check:**
- Items with IDs starting with "temp_" after successful sync
- Console errors about foreign key constraints

**Fix:**
- Verify sync completed successfully
- Check for server errors in console
- Refresh page to reload data

---

## Performance Benchmarks

**Expected Performance:**
- Initial sync (100 jobs, 500 time entries): < 10 seconds
- Offline page load: < 1 second
- Create operation offline: < 100ms
- Sync 10 items: < 5 seconds
- Photo upload (1MB): < 3 seconds

---

## Testing Checklist

- [ ] Connection status indicator works
- [ ] Data loads offline
- [ ] Create operations queue offline
- [ ] Update operations queue offline
- [ ] Delete operations queue offline
- [ ] Photos queue offline
- [ ] Auto-sync on reconnect
- [ ] Manual sync trigger
- [ ] Conflict resolution
- [ ] Failed sync retry
- [ ] Temp IDs replaced after sync
- [ ] Service worker caches resources
- [ ] No data loss
- [ ] No console errors
- [ ] Sync button behavior correct

---

## Production Readiness Criteria

✅ **READY** when:
- All checklist items pass
- No console errors during offline operations
- Sync succeeds 100% in testing
- Photos upload successfully
- No data loss in any scenario
- Temp IDs always replaced
- Performance meets benchmarks

⚠️ **NOT READY** when:
- Sync failures occur
- Data loss possible
- Console shows errors
- Temp IDs persist
- Performance degraded
