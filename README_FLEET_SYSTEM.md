# Fleet Management System - Complete Implementation Guide

## System Overview

A comprehensive dual-company fleet management system with custom authentication, vehicle tracking, maintenance logging, GPS location tracking, vendor management, and document storage.

## Access URLs

- **Fleet Login**: `/fleet/login`
- **Fleet Dashboard**: `/fleet`
- **Main FieldTrack App**: `/` (unchanged)

## Default Login Credentials

```
Username: admin
Password: admin123
```

## Database Schema

### 1. Custom Authentication (NO Supabase Auth)

**`app_users` table** - Custom username/password authentication
- `id` (uuid, primary key)
- `username` (text, unique)
- `password_hash` (text) - Bcrypt hashed via database function
- `created_by`, `created_at`

**Database Functions:**
```sql
-- Create user with hashed password
SELECT create_app_user('username', 'password', 'created_by');

-- Verify password and get user ID
SELECT verify_user_password('username', 'password'); -- Returns user ID if valid
```

### 2. Companies

**`companies` table**
- `id`, `name`, `logo_url`
- `location_tags` (jsonb array)
- `created_by`, `created_at`

**Pre-loaded Companies:**
- Martin Builder (all vehicle categories)
- Tri County (trucks only)

### 3. Vehicles

**`vehicles` table**
- Basic Info: `vehicle_name`, `year`, `make`, `model`
- Type: `type` (truck/heavy_equipment/small_engine/trailer)
- Identifiers: `serial_number`, `vin`, `license_plate`
- Status: `status` (Active/Maintenance/Out of Service/Sold)
- Metrics: `current_mileage`, `engine_hours`
- Purchase: `purchase_date`, `purchase_price`, `vendor_name`
- GPS: `latitude`, `longitude`, `address`, `location_name`, `last_location_update`
- Image: `image_url`
- Settings: `service_settings` (jsonb), `service_info` (jsonb)
- Management: `archived` (boolean), `preferred_service_vendor_id`

### 4. Maintenance Logs

**`maintenance_logs` table**
- Type: `type` (service/repair)
- Status: `status` (scheduled/in_progress/complete)
- Details: `title`, `date`, `mileage_hours`
- Description: `description`, `notes`
- Parts: `part_numbers`, `part_cost`, `vendor_id`
- Checklist: `service_checklist` (jsonb array)
- Linking: `parent_log_id` (for repair tickets linked to service tickets)

### 5. Vendors

**`vendors` table**
- `name` (unique), `phone`, `email`
- `address`, `city`, `state`, `zip`
- `website`, `contact_person`

### 6. Location History

**`location_history` table**
- `vehicle_id`, `latitude`, `longitude`
- `address`, `notes`, `mileage_hours`
- `updated_by`, `updated_at`

### 7. Service Checklist Items Bank

**`service_checklist_items` table**
- `company_id`, `name`, `part_info`, `category`
- Reusable templates for maintenance checklists

### 8. Vehicle Documents

**`vehicle_documents` table**
- `vehicle_id`, `file_name`, `file_path`
- `file_size`, `file_type`, `description`
- `uploaded_by`, `uploaded_at`

## Storage Buckets

### 1. vehicle-images
- **Public**: Yes
- **Size Limit**: 5MB
- **Allowed Types**: image/jpeg, image/png, image/gif, image/webp

### 2. vehicle-documents
- **Public**: Yes
- **Size Limit**: 10MB
- **Allowed Types**: PDF, images, DOC/DOCX, XLS/XLSX, TXT

## RLS Policies

**All tables have RLS enabled with the following pattern:**
- `anyone_can_view_*` - SELECT for anon and authenticated
- `authenticated_can_insert_*` - INSERT for authenticated
- `authenticated_can_update_*` - UPDATE for authenticated
- `authenticated_can_delete_*` - DELETE for authenticated

## Features by User Type

### All Authenticated Users Can:
1. **View all data** - Companies, vehicles, vendors, maintenance logs
2. **Add/Edit/Delete** - Full CRUD on all entities
3. **Upload files** - Vehicle images and documents
4. **Manage settings** - Users, vendors, checklist items, archived vehicles

## Company-Specific Logic

### Martin Builder
- Shows all 4 vehicle categories:
  - Trucks (mileage-based)
  - Heavy Equipment (hours-based)
  - Small Engines (hours-based)
  - Trailers (mileage-based)

### Tri County
- Shows **Trucks only** (mileage-based)
- Other categories hidden from UI

## Key Features

### 1. Vehicle Management
- Grid view with vehicle cards
- Status dropdown (Active, Maintenance, Out of Service, Sold)
- Vehicle type filtering (Trucks, Heavy Equipment, Small Engines, Trailers)
- Image upload for each vehicle
- Quick stats: mileage/hours, location, last update

### 2. Vehicle Details Dialog
**Tabs:**
- **Info**: Edit vehicle details, upload image
- **Maintenance**: Service/repair logs with checklists
- **Location**: GPS tracking, location history, map integration
- **Documents**: Upload/download PDFs, images, manuals

### 3. Maintenance Logging
- Service vs Repair tracking
- Status workflow: Scheduled → In Progress → Complete
- Part tracking: part numbers, costs, vendor
- Service checklist from bank (reusable templates)
- Link repair tickets to service tickets (parent_log_id)

### 4. GPS Location Tracking
- Get current GPS coordinates (browser geolocation)
- Manual GPS entry (latitude/longitude)
- Address and location name
- Location history with mileage/hours snapshot
- "Open in Google Maps" integration

### 5. Map View
- Shows all equipment with GPS coordinates
- Status indicators (green/yellow/red/gray dots)
- Location name and address
- "Open in Google Maps" for navigation
- Filterable by status

### 6. Settings Panel
**Four tabs:**
1. **Users**: Add/delete users with bcrypt password hashing
2. **Vendors**: Manage service vendors with contact info
3. **Checklist Items**: Build reusable service checklist templates
4. **Archived**: Restore archived vehicles

### 7. Document Management
- Upload registration, insurance, manuals, etc.
- File size and type validation
- Download or delete documents
- Track upload date and uploader

## Technical Implementation

### Authentication Flow
```typescript
// Login
const { data: userId, error } = await supabase.rpc('verify_user_password', {
  p_username: 'admin',
  p_password: 'admin123',
});

// Store in Zustand
setUser({ id: userId, username: 'admin' });

// Create new user
const { data: newUserId } = await supabase.rpc('create_app_user', {
  p_username: 'newuser',
  p_password: 'password123',
  p_created_by: currentUser.username,
});
```

### Vehicle Status Update
```typescript
await supabase
  .from('vehicles')
  .update({ status: 'Maintenance' })
  .eq('id', vehicleId);
```

### GPS Location Update
```typescript
// Update vehicle
await supabase
  .from('vehicles')
  .update({
    latitude: 40.7128,
    longitude: -74.0060,
    address: '123 Main St',
    location_name: 'Main Warehouse',
    last_location_update: new Date().toISOString(),
  })
  .eq('id', vehicleId);

// Add to history
await supabase.from('location_history').insert({
  vehicle_id: vehicleId,
  latitude: 40.7128,
  longitude: -74.0060,
  address: '123 Main St',
  notes: 'Delivered to warehouse',
  mileage_hours: 12500,
  updated_by: 'admin',
});
```

### Image Upload
```typescript
const fileExt = file.name.split('.').pop();
const fileName = `${vehicleId}-${Date.now()}.${fileExt}`;

await supabase.storage
  .from('vehicle-images')
  .upload(fileName, file);

const { data: { publicUrl } } = supabase.storage
  .from('vehicle-images')
  .getPublicUrl(fileName);

await supabase
  .from('vehicles')
  .update({ image_url: publicUrl })
  .eq('id', vehicleId);
```

### Document Upload
```typescript
const fileName = `${vehicleId}/${Date.now()}.pdf`;

await supabase.storage
  .from('vehicle-documents')
  .upload(fileName, file);

const { data: { publicUrl } } = supabase.storage
  .from('vehicle-documents')
  .getPublicUrl(fileName);

await supabase.from('vehicle_documents').insert({
  vehicle_id: vehicleId,
  file_name: file.name,
  file_path: publicUrl,
  file_size: file.size,
  file_type: file.type,
  uploaded_by: 'admin',
});
```

## UI/UX Guidelines

### Design Theme
- **Primary Color**: Yellow (#FBBF24 - yellow-600)
- **Dark Backgrounds**: Slate-900, Slate-800
- **Accent Borders**: Yellow-600 (4px borders on headers)
- **Card Hover**: Shadow-lg transition

### Mobile Responsiveness
- Grid layouts: 1 col mobile → 2 col tablet → 3 col desktop
- Touch targets: Minimum 44x44px
- Compact spacing on mobile
- Responsive tabs with icon + text

### Status Colors
- **Active**: Green-100/800
- **Maintenance**: Yellow-100/800
- **Out of Service**: Red-100/800
- **Sold**: Slate-100/800

## Data Flow

### Adding a Vehicle
1. User clicks "Add Vehicle" FAB or button
2. Opens dialog with form (name, year, make, model, type, etc.)
3. Submit creates vehicle with status="Active", archived=false
4. Returns to vehicle list with new vehicle visible

### Updating Location
1. User opens vehicle details → Location tab
2. Either:
   - Click "Get Current" to use browser geolocation
   - Manually enter latitude/longitude
3. Enter address, location name, notes, current mileage/hours
4. Click "Update Location" to save
5. Creates location_history entry + updates vehicle

### Adding Maintenance Log
1. User opens vehicle details → Maintenance tab
2. Clicks "Add Log"
3. Fills out type (service/repair), status, title, date, etc.
4. Optionally adds part numbers, costs, vendor
5. Can select checklist items from bank
6. Submit creates maintenance_logs entry

## Security

### Password Hashing
- Uses PostgreSQL `pgcrypto` extension
- Bcrypt algorithm with auto salt generation
- Password verification via `crypt()` comparison
- No plaintext passwords stored

### RLS Policies
- All tables require authentication
- Anonymous users can only SELECT (view data)
- Authenticated users have full CRUD access
- Storage buckets follow same pattern

### Audit Trail
- `created_by` field on all user-created records
- Stores username (not user ID) for portability
- Timestamps on all records
- Location history tracks who updated when

## Testing Checklist

### Authentication
- ✅ Login with admin/admin123
- ✅ Create new user
- ✅ Login with new user
- ✅ Invalid password rejection
- ✅ Duplicate username rejection

### Vehicle Management
- ✅ View vehicles by company
- ✅ Filter by type (Trucks, Heavy Eq, etc.)
- ✅ Filter by status
- ✅ Add new vehicle
- ✅ Edit vehicle info
- ✅ Upload vehicle image
- ✅ Change status dropdown
- ✅ Archive/restore vehicle

### Maintenance
- ✅ Add service log
- ✅ Add repair log
- ✅ Change status
- ✅ Add part costs
- ✅ Select vendor
- ✅ View maintenance history

### Location
- ✅ Get current GPS location
- ✅ Manual GPS entry
- ✅ Update address/location name
- ✅ View location history
- ✅ Open in Google Maps

### Documents
- ✅ Upload PDF
- ✅ Upload image
- ✅ Download document
- ✅ Delete document

### Settings
- ✅ Add user
- ✅ Delete user
- ✅ Add vendor
- ✅ Delete vendor
- ✅ Add checklist item
- ✅ Delete checklist item
- ✅ View archived vehicles
- ✅ Restore vehicle
- ✅ Sign out

## Future Enhancements

### Phase 2 Features
- Service reminders based on mileage/hours
- Maintenance cost reports by vehicle
- Vendor performance tracking
- Photo gallery with categories
- Export maintenance logs to PDF
- Calendar view for scheduled maintenance
- Mobile app (React Native)
- Barcode/QR code scanning for inventory
- Fuel tracking integration
- Fleet utilization reports

### Advanced Features
- Multi-location support
- Role-based permissions (Admin, Manager, Viewer)
- Integration with accounting software
- Real-time GPS tracking (via OBD-II device)
- Predictive maintenance alerts
- Parts inventory management
- Work order system
- Mobile signature capture
- Email notifications for due maintenance

## Troubleshooting

### Common Issues

**Login fails with valid credentials**
- Check database function exists: `verify_user_password`
- Verify pgcrypto extension is enabled
- Check password was hashed during user creation

**Images not uploading**
- Verify storage bucket "vehicle-images" exists
- Check file size < 5MB
- Verify RLS policies on storage.objects

**Documents not showing**
- Check storage bucket "vehicle-documents" exists
- Verify file path is stored correctly in database
- Check public URL generation

**Map view shows no vehicles**
- Ensure vehicles have latitude AND longitude (both required)
- Check for NULL values in GPS coordinates
- Verify archived=false filter

## Support

For issues or questions, contact the development team or refer to:
- Database schema in Supabase dashboard
- RLS policies in Supabase table editor
- Storage bucket configuration in Supabase storage panel

---

**Built with**: React, TypeScript, Vite, Tailwind CSS, Supabase (PostgreSQL, Storage), shadcn/ui

**Custom Authentication**: Username/Password with Bcrypt via PostgreSQL functions (NO Supabase Auth)
