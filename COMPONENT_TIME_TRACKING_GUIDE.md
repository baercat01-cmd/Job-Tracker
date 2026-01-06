# Component Time Tracking Guide

## Overview
Your system already has a complete component-based time tracking workflow! Here's how it works:

---

## For Office Staff

### 1. Managing Global Components

**Location:** Office Dashboard → Job Detail → Components Tab

**Creating Components:**
1. Click "Manage Components" button
2. Click "New Component" 
3. Enter:
   - Component Name (e.g., "Post Setting", "Wall Framing", "Roof Steel")
   - Description (optional)
4. Click "Create"

**Editing Components:**
- Click the edit icon on any component
- Update name or description
- Changes apply globally to all jobs using this component

**Deleting Components:**
- Click delete icon
- System shows usage warnings (time entries, photos, tasks)
- Type component name to confirm permanent deletion
- ⚠️ Deletes all associated time entries, photos, and tasks!

### 2. Assigning Components to Jobs

**Location:** Office Dashboard → Job Detail → Components Tab

**How to Assign:**
1. Click "Manage Components" button
2. Select checkboxes for components to assign to this job
3. Click "Save Components"

**Managing Assigned Components:**
- **Toggle Active/Inactive:** Click the toggle icon (only active components show for crew)
- **Remove from Job:** Click trash icon (doesn't delete global component)
- **Reorder:** Use up/down arrows to change order

---

## For Crew Members (Foremen)

### 1. Adding Component Time

**Location:** Foreman Dashboard → Select Job → Timer view

**Step 1: Choose Entry Mode**
- **Timer Mode:** Live timer for active work (recommended)
- **Manual Entry:** For past work or quick logging

### 2. Timer Mode (Live Tracking)

**Starting a Timer:**
1. Click "Add Component" button
2. Search/select component from dropdown
3. Choose crew tracking method:
   - **Select Workers:** Pick specific workers from list
   - **Crew Count:** Enter number as simple count
4. Click "Start Timer"

**Managing Active Timers:**
- **Pause:** Stops timer, preserves time
- **Resume:** Continues from paused state
- **Stop:** Opens review modal to save entry

**Reviewing & Saving:**
1. Review total time (auto-calculated)
2. Adjust crew count or workers if needed
3. Add notes (optional)
4. Click "Save Entry"

### 3. Manual Entry (Past Work)

**4-Step Wizard:**

**Step 1: Select Component**
- Choose date worked
- Search/select component from dropdown

**Step 2: Enter Time**
- Use scroll wheels to select hours and minutes
- See total time displayed

**Step 3: Who Worked**
- Select specific workers from list, OR
- Enter crew count number

**Step 4: Add Details**
- Add photos (optional)
- Add notes (optional)
- Click "Save Entry"

---

## How It Works Together

### Component Assignment Flow:
```
Office Staff → Create/Assign Components to Job
         ↓
Crew Members → See ONLY components assigned to their job
         ↓
Crew Members → Log time against those components
         ↓
Office Staff → View time reports by component
```

### Data Tracking:
- **Component:** What work was done
- **Time:** Duration of work
- **Crew:** Who worked (names or count)
- **Date:** When work was performed
- **Notes/Photos:** Additional context
- **Timer vs Manual:** Method of entry

### Reporting:
Office staff can view:
- Total time per component
- Time breakdown by crew member
- Component completion progress
- Time entries with full details

---

## Key Features

### For Office:
✅ Global component library (reusable across all jobs)  
✅ Flexible component assignment per job  
✅ Active/inactive toggle for component availability  
✅ Edit components globally or per-job  
✅ Delete with usage warnings  

### For Crew:
✅ Simple component selection from assigned list  
✅ Live timer or manual entry options  
✅ Worker name tracking or crew count  
✅ Multiple simultaneous timers  
✅ Pause/resume functionality  
✅ Photo and note attachment  
✅ Searchable component dropdown  

### System Benefits:
✅ Accurate labor cost tracking by component  
✅ Project progress monitoring  
✅ Crew accountability  
✅ Budget vs actual comparison  
✅ Historical data for estimating  

---

## Example Workflow

**Office Setup:**
1. Create components:
   - "Foundation Work"
   - "Post Setting" 
   - "Wall Framing"
   - "Roof Installation"
2. Assign to "Smith Barn" job
3. Set all to "Active"

**Crew Usage:**
1. Foreman selects "Smith Barn" job
2. Clicks "Add Component"
3. Selects "Foundation Work"
4. Chooses 3 workers: John, Mike, Sarah
5. Starts timer
6. Works for 4.5 hours
7. Stops timer and saves
8. System records:
   - Job: Smith Barn
   - Component: Foundation Work
   - Duration: 4.5 hours
   - Crew: 4 people (John, Mike, Sarah + foreman)
   - Total man-hours: 18 hours (4.5 × 4)

**Office Review:**
- Views "Smith Barn" job dashboard
- Sees 18 man-hours logged to "Foundation Work"
- Compares against estimate
- Tracks component completion progress

---

## Database Structure

**Components Table:**
- Global library of all work types
- Can be used across multiple jobs

**Jobs.components Field (JSONB):**
- Stores which components are assigned to each job
- Includes active/inactive status per job

**Time Entries Table:**
- Links to job_id and component_id
- Stores hours, crew count, worker names
- Tracks manual vs timer-based entries

This allows:
- Reusable components across jobs
- Per-job component customization
- Detailed time tracking and reporting
- Historical data preservation

---

## Tips

**Office Staff:**
- Create specific, clear component names
- Add descriptions to help crew identify correct component
- Use active/inactive to control what crew sees
- Review time entries regularly for accuracy

**Crew Members:**
- Start timers when beginning work
- Use pause feature for breaks
- Add photos to document progress
- Include notes for context
- Use manual entry for forgotten/past work

**Best Practices:**
- Keep component names consistent across jobs
- Archive unused components instead of deleting
- Review and adjust crew counts before saving
- Add notes when work conditions vary
- Take photos to verify location and progress
