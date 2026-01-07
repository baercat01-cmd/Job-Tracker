# FieldTrack Stability Testing Guide

## Overview
This guide documents the stability improvements implemented to prevent server crashes on iPhone web users during component updates and photo uploads.

## Implemented Features

### 1. Robust Error Handling ✅
All update and submit operations are wrapped in try-catch blocks with retry logic:
- **Automatic Retry**: Failed operations automatically retry up to 3 times with exponential backoff
- **User-Friendly Messages**: Displays contextual error messages instead of crashing
- **Offline Fallback**: Seamlessly queues operations when network fails
- **HTTP Status Tracking**: Captures exact error codes (502, 504, 403, etc.) for debugging

### 2. Main Thread Optimization ✅
All UI updates during sync are handled on the main thread:
- **requestAnimationFrame**: Used for state updates to prevent browser freezing
- **Non-blocking Operations**: Cache updates happen asynchronously
- **Progress Updates**: Real-time progress without blocking UI

### 3. Data Chunking ✅
Large files (photos, documents) are uploaded in 1MB chunks:
- **Auto-detection**: Files >1MB automatically use chunked upload
- **Memory Safety**: Prevents OOM errors on iPhone
- **Progressive Upload**: Shows upload progress per chunk
- **Mobile Optimization**: Sequential uploads on mobile, parallel on desktop

### 4. Debug Logging ✅
Hidden debug log system for tracking failures:
- **Persistent Storage**: Logs survive app crashes
- **HTTP Status Codes**: Captures 502, 504, 403, etc.
- **User Agent Tracking**: Identifies iPhone-specific issues
- **Export Capability**: Download logs as CSV for analysis

### 5. Stress Testing ✅
Built-in stress test utility for validation:
- **Concurrent Operations**: Simulates 5+ simultaneous updates
- **Network Simulation**: Tests under Slow 3G conditions
- **Photo Upload Testing**: Tests large file handling
- **Detailed Reporting**: Shows success/failure rates

## How to Use

### Accessing Debug Logs

Open browser console and run:
```javascript
// View all error logs
window.getErrorLogs()

// Export logs as CSV
window.exportErrorLogs()

// Clear logs
window.clearErrorLogs()
```

### Running Stress Tests

#### Basic Test (5 concurrent component updates)
```javascript
window.runStressTest('your-user-id', 'your-job-id')
```

#### Advanced Test (10 updates + photos under Slow 3G)
```javascript
window.runStressTest('your-user-id', 'your-job-id', {
  concurrentUpdates: 10,
  simulateSlowNetwork: true,
  networkLatency: 3000, // 3 seconds
  includePhotoUploads: true,
  photoSize: 2097152 // 2MB photos
})
```

#### Configuration Options
```typescript
{
  concurrentUpdates: number;      // Default: 5
  updateDelay: number;            // Default: 100ms
  simulateSlowNetwork: boolean;   // Default: true
  networkLatency: number;         // Default: 3000ms (3s)
  includePhotoUploads: boolean;   // Default: false
  photoSize: number;              // Default: 2MB
}
```

### Test Results Interpretation

The stress test returns:
```javascript
{
  totalOperations: 10,
  successful: 8,
  failed: 2,
  duration: 45000, // milliseconds
  errors: [
    {
      timestamp: "2025-01-07T10:30:00Z",
      operation: "Update components/abc123",
      error: "Failed to fetch",
      httpStatus: 0,
      userAgent: "...",
      retryCount: 3
    }
  ]
}
```

- **Success Rate**: Should be >90% for production readiness
- **Failed Operations**: Review error logs to identify patterns
- **HTTP Status 0**: Network errors (offline/timeout)
- **HTTP 502/503/504**: Server errors (need backend investigation)
- **HTTP 403**: Permission errors (auth issue)

## Testing Checklist

### Before Deployment
- [ ] Run basic stress test (5 concurrent updates)
- [ ] Run advanced stress test with photos
- [ ] Test under simulated Slow 3G
- [ ] Verify error logs are being captured
- [ ] Test on actual iPhone device (Safari)
- [ ] Test on iPhone (Chrome/Firefox)
- [ ] Verify offline mode graceful degradation

### iPhone-Specific Testing
1. **Open on iPhone Safari**
2. **Enable Airplane Mode** → Make updates → **Disable Airplane Mode**
   - ✓ Updates should queue and sync automatically
3. **Throttle Network to Slow 3G** (Safari Dev Tools)
   - ✓ Large photo uploads should chunk
   - ✓ UI should remain responsive
4. **Force Background** → Return to app
   - ✓ Sync should resume
5. **Clear Browser Cache** → Test offline functionality
   - ✓ Queue should persist

### Common Failure Patterns

#### Pattern 1: Network Timeouts (HTTP 0 or 408)
**Symptom**: Requests timeout under slow network
**Solution**: Implemented automatic retry with backoff
**Test**: Verify with `simulateSlowNetwork: true`

#### Pattern 2: Server Overload (HTTP 502, 503, 504)
**Symptom**: Multiple concurrent requests crash server
**Solution**: 
- Sequential uploads on mobile
- 100ms delay between operations
- Retry logic with backoff
**Test**: Run stress test with 10+ concurrent operations

#### Pattern 3: Memory Overflow (OOM)
**Symptom**: Large photo uploads crash on iPhone
**Solution**: 1MB chunked uploads
**Test**: Upload 5MB+ photos, check chunking logs

#### Pattern 4: UI Freeze
**Symptom**: App becomes unresponsive during sync
**Solution**: Main thread optimization with requestAnimationFrame
**Test**: Monitor UI responsiveness during stress test

## Monitoring in Production

### Key Metrics to Track
1. **Error Rate**: Track `window.getErrorLogs().length`
2. **HTTP Status Distribution**: Group by status codes
3. **Retry Success Rate**: Operations that succeed after retry
4. **Device Type**: iPhone vs other devices error rates
5. **Network Conditions**: Errors correlated with connection type

### Alert Thresholds
- **Error Rate >5%**: Investigate immediately
- **HTTP 502/503/504 >1%**: Backend capacity issue
- **Retry Exhaustion >10%**: Network/backend stability issue
- **iPhone-specific errors >2x other devices**: iOS-specific bug

## Debugging iPhone Issues

### Step 1: Enable Remote Debugging
1. iPhone: Settings → Safari → Advanced → Web Inspector
2. Mac: Safari → Develop → [Your iPhone] → [Your Site]

### Step 2: Monitor Console
```javascript
// Watch for errors
window.addEventListener('error', (e) => {
  console.error('Global error:', e);
});

// Watch for promise rejections
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise:', e.reason);
});
```

### Step 3: Export Logs
```javascript
// After reproducing issue
const csv = window.exportErrorLogs();
console.log(csv); // Copy to clipboard or email
```

### Step 4: Analyze Stack Traces
Error logs include full stack traces:
```javascript
window.getErrorLogs().forEach(log => {
  console.log(`${log.operation}:`);
  console.log(log.stackTrace);
});
```

## Best Practices

### For Developers
1. **Always use withRetry** for network operations
2. **Use requestAnimationFrame** for UI state updates
3. **Test on real iPhone devices** before deploying
4. **Monitor error logs** in production
5. **Export and analyze** error patterns weekly

### For QA Testing
1. **Test under Slow 3G** conditions
2. **Toggle airplane mode** frequently
3. **Upload photos 2MB+** to verify chunking
4. **Run stress tests** before each release
5. **Verify error messages** are user-friendly

### For Operations
1. **Monitor HTTP status codes** in production
2. **Set up alerts** for error rate spikes
3. **Review error logs** weekly
4. **Track iPhone-specific errors** separately
5. **Keep error logs** for 30 days minimum

## Rollback Plan

If issues persist after deployment:

1. **Immediate**: Error logs will help identify root cause
2. **Short-term**: Offline queue ensures no data loss
3. **Long-term**: Review stress test results and adjust thresholds

## Support

For issues or questions:
- Review error logs: `window.getErrorLogs()`
- Export logs: `window.exportErrorLogs()`
- Run diagnostics: `window.runStressTest()`

## Version History

- **v1.0** (2025-01-07): Initial stability improvements
  - Error handling system
  - Chunked uploads
  - Main thread optimization
  - Stress testing utility
  - Debug logging
