# Contact Management System Guide

## Current Status

✅ **Automatic Contact Creation Implemented**
- New jobs/quotes automatically create contacts when customer email is provided
- System prevents duplicate contacts by checking name, email, and phone
- Contacts are properly linked to jobs for easy tracking

✅ **Existing Contacts Backfilled**
- 3 customer contacts currently in database
- 1 job has a properly linked contact (48x60 Barn - Hubert Ropp)
- Backfill script has been run to create contacts from all quotes with email data

## Why Some Jobs Don't Have Contacts

**Database Requirement**: The `contacts` table requires an email address (NOT NULL constraint).

**Current Situation**:
- **17 active jobs** in the system
- **Only 1 job** has email data in the quote
- **16 jobs** were created without customer email addresses

**Root Cause**: Jobs/quotes were created before the email requirement was enforced.

## Solutions for Missing Contacts

### Option 1: Edit Existing Jobs to Add Email
1. Go to Jobs page
2. Click "Edit" on a job
3. Update the client name (this triggers contact update)
4. The system will try to link/update the contact

**Note**: To create a NEW contact, you need to:
1. Go to Contacts page
2. Click "Add Contact"
3. Enter name, **email** (required), phone, and link to job

### Option 2: Edit Quotes to Add Customer Email
1. Go to Proposals page
2. Edit a quote
3. Add customer email and phone in the customer info section
4. Save the quote
5. System will automatically create contact

### Option 3: Manual Contact Entry
1. Navigate to **Contacts** page
2. Click **"+ Add"** button
3. Fill in:
   - Name: Customer name
   - **Email: REQUIRED FIELD** ⚠️
   - Phone: Optional but recommended
   - Category: Select "Customer"
   - Link to Job: Select the job from dropdown
4. Save

## Auto-Creation Triggers

The system automatically creates/updates contacts when:

1. ✅ **Creating a new job** (CreateJobDialog)
   - Uses `client_name` for contact name
   - Requires manual email entry for full contact

2. ✅ **Creating a new quote** (QuoteIntakeForm)
   - Uses `customer_name`, `customer_email`, `customer_phone`
   - Best source for complete contact data

3. ✅ **Editing a job** (EditJobDialog) - NEW!
   - Updates existing contact if customer name changes
   - Links contact to job if not already linked

4. ✅ **Creating customer portal link** (CustomerPortalManagement)
   - Loads customer info from contacts/quotes
   - Pre-fills email and phone for portal access

## Contact Data Flow

```
Quote Created
    ↓
customer_email exists? → YES → Create/Update Contact
    ↓                              ↓
    NO                        Link to job_id
    ↓                              ↓
Manual entry required         Show in Contacts page
                                   ↓
                         Use in Customer Portal
```

## Customer Portal Integration

When creating a customer portal link:

1. **System checks (in priority order)**:
   - ✅ Contacts table (job-specific customer with email)
   - ✅ Quote data (customer_email, customer_phone, customer_name)
   - ✅ Job data fallback (client_name only, no email/phone)

2. **Auto-populates portal form** with:
   - Customer name
   - Customer email (if available)
   - Customer phone (if available)

3. **If email missing**:
   - Shows toast: "Please enter customer email and phone"
   - User must manually enter required information

## Best Practices Going Forward

### For New Jobs
1. Always create a **Quote first** with complete customer info:
   - Customer name
   - **Customer email** ⚠️ REQUIRED
   - Customer phone
   - Customer address

2. Then convert quote to job
   - Contact is automatically created
   - Contact is automatically linked to job
   - Customer portal can be created immediately

### For Existing Jobs Without Contacts
1. Edit the quote to add customer email
2. OR manually create contact with email
3. System will auto-link contact to job

## Viewing Contact Status

Run this query in Database > SQL Editor to see all jobs and their contact status:

```sql
SELECT 
  j.name as job_name,
  j.client_name,
  j.status,
  CASE 
    WHEN c.id IS NOT NULL THEN '✓ Contact exists'
    WHEN q.customer_email IS NOT NULL THEN 'Has email - can auto-create'
    ELSE '⚠ Needs manual entry'
  END as contact_status,
  c.email as contact_email,
  c.phone as contact_phone
FROM jobs j
LEFT JOIN quotes q ON q.job_id = j.id
LEFT JOIN contacts c ON c.job_id = j.id AND c.category = 'customer'
WHERE j.status IN ('active', 'quoting', 'prepping')
ORDER BY j.created_at DESC;
```

## Database Schema

```sql
contacts table:
- id (uuid, primary key)
- name (text, NOT NULL)
- email (text, NOT NULL) ⚠️ REQUIRED
- phone (text, nullable)
- category (text, NOT NULL: 'customer' | 'vendor' | 'subcontractor')
- job_id (uuid, foreign key to jobs)
- is_active (boolean)
- created_by (uuid, foreign key to user_profiles)
- created_at (timestamp)
```

## Troubleshooting

### "Contact not showing in portal link creation"
- Check if contact has email address (required)
- Check if contact.category = 'customer'
- Check if contact is linked to the job (job_id matches)

### "Can't create contact for existing job"
- Email is required - get customer email first
- Edit quote to add customer_email
- OR create contact manually with email

### "Duplicate contacts created"
- System checks name, email, and phone to prevent duplicates
- If customer changes email, a new contact may be created
- Merge duplicates manually in Contacts page if needed

## Summary

✅ **System is working correctly**
✅ **Auto-creation is active for new jobs/quotes**
⚠️ **16 existing jobs need email addresses to create contacts**

**Next Steps**:
1. For important jobs: Edit quotes to add customer email
2. For new jobs: Always use quote workflow with complete customer info
3. Contacts will auto-populate customer portal forms
