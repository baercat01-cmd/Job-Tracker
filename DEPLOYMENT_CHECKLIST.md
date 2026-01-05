# FieldTrack Pro - Deployment Checklist

## Pre-Deployment Testing

### Core Functionality
- [ ] User authentication (PIN + biometric)
- [ ] User roles (crew, office, payroll)
- [ ] Job creation and management
- [ ] Component management
- [ ] Time tracking (timer + manual)
- [ ] Daily logs with weather
- [ ] Photo uploads with GPS
- [ ] Materials management
- [ ] Worker management
- [ ] Notifications system

### Offline Functionality
- [ ] Connection status indicator
- [ ] Offline data access (jobs, components, logs)
- [ ] Offline time entry creation
- [ ] Offline daily log creation  
- [ ] Offline photo queuing
- [ ] Automatic sync on reconnect
- [ ] Manual sync trigger
- [ ] Conflict resolution
- [ ] Failed sync retry
- [ ] Temp ID replacement
- [ ] Service worker caching

### Performance
- [ ] Initial load < 3 seconds
- [ ] Page transitions < 500ms
- [ ] Offline operations < 100ms
- [ ] Full sync < 15 seconds
- [ ] Photo upload < 5 seconds per photo

### Browser Compatibility
- [ ] Chrome (Desktop & Mobile)
- [ ] Safari (Desktop & Mobile)
- [ ] Firefox (Desktop)
- [ ] Edge (Desktop)

### Mobile Responsiveness
- [ ] All pages responsive on mobile
- [ ] Touch-friendly buttons (minimum 44x44px)
- [ ] No horizontal scrolling
- [ ] Proper keyboard handling

## Database Readiness

### Schema Verification
- [ ] All tables created with RLS enabled
- [ ] Foreign key constraints correct
- [ ] Indexes on frequently queried columns
- [ ] Timestamp columns present

### Data Integrity
- [ ] User profiles created
- [ ] Initial components loaded
- [ ] Test jobs created
- [ ] No orphaned records

### Security
- [ ] RLS policies tested
- [ ] Service role key secured
- [ ] Admin password documented
- [ ] No sensitive data in console logs (production)

## Backend Services

### Supabase/OnSpace Cloud
- [ ] Database online and accessible
- [ ] Storage bucket configured
- [ ] RLS policies active
- [ ] Edge functions deployed (if any)

### API Keys & Secrets
- [ ] VITE_SUPABASE_URL configured
- [ ] VITE_SUPABASE_ANON_KEY configured
- [ ] Weather API key (if used)
- [ ] GPS/Maps API key (if used)

## Production Build

### Code Quality
- [ ] No TypeScript errors (`npm run build`)
- [ ] No ESLint errors
- [ ] No console.error in production code
- [ ] All imports resolved
- [ ] Dead code removed

### Build Verification
- [ ] Production build succeeds
- [ ] Bundle size < 2MB
- [ ] All assets included
- [ ] Source maps generated

### Environment Variables
- [ ] Production .env file created
- [ ] Correct backend URL
- [ ] Anon key (not service role key!)
- [ ] No hardcoded secrets

## Deployment Steps

### 1. Pre-Deployment
```bash
# Build for production
npm run build

# Test production build locally
npm run preview

# Verify no errors in console
# Test core functionality
```

### 2. Deploy to OnSpace
- [ ] Click "Publish" button in OnSpace
- [ ] Select publish type (onspace.app or custom domain)
- [ ] Wait for deployment confirmation
- [ ] Note deployed URL

### 3. Post-Deployment Verification
- [ ] Visit deployed URL
- [ ] Test authentication
- [ ] Create test time entry
- [ ] Upload test photo
- [ ] Test offline mode
- [ ] Check console for errors

## User Acceptance Testing

### Crew User Testing
- [ ] Login with PIN
- [ ] Select job
- [ ] Start/stop timer
- [ ] Create daily log
- [ ] Upload photos
- [ ] Test offline mode

### Office User Testing
- [ ] Login as office user
- [ ] View all jobs
- [ ] Create new job
- [ ] Manage components
- [ ] View time entries
- [ ] Export data

### Admin Testing
- [ ] Admin password bypass
- [ ] User management
- [ ] Settings access
- [ ] All permissions working

## Documentation

- [ ] User guide created
- [ ] Admin guide created
- [ ] OFFLINE_TESTING.md reviewed
- [ ] Troubleshooting guide
- [ ] Contact information provided

## Rollback Plan

### If Issues Occur
1. Note the specific issue
2. Check browser console for errors
3. Revert to previous version if critical
4. Fix issues in development
5. Re-test before re-deploying

### Backup Strategy
- [ ] Database backup before deployment
- [ ] Previous version URL saved
- [ ] Git commit tagged for this release
- [ ] Environment variables backed up

## Launch Communication

- [ ] Notify users of deployment
- [ ] Provide user guide link
- [ ] Share support contact
- [ ] Set expectations for offline mode

## Monitoring (First 24 Hours)

- [ ] Check error rates
- [ ] Monitor sync success rate
- [ ] Review user feedback
- [ ] Check performance metrics
- [ ] Verify offline functionality

## Success Criteria

✅ **READY TO DEPLOY** when:
- All pre-deployment tests pass
- No critical console errors
- Offline functionality works 100%
- Performance meets benchmarks
- Database secured with RLS
- User acceptance testing complete
- Documentation ready
- Rollback plan prepared

---

## Deployment Sign-Off

**Tested By:** _______________ **Date:** ___________

**Approved By:** _______________ **Date:** ___________

**Deployed By:** _______________ **Date:** ___________

**Deployment URL:** _________________________________

**Notes:**
_______________________________________________________________
_______________________________________________________________
_______________________________________________________________
