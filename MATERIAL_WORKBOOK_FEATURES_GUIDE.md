# Material Workbook Features Guide

## 🎯 Where to Find the New Features

All the new features you requested are **already implemented** and working! They only appear when viewing a **working (unlocked) workbook**.

### Step-by-Step Guide:

#### 1️⃣ **Open a Working Workbook**
- Look for the **green card** labeled "Working Version"
- Click the **"View"** button on this card
- ✅ The view dialog will open

#### 2️⃣ **Once Inside the Workbook View Dialog**

You'll see **three new features**:

---

### ✨ Feature 1: Add New Sheet
**Location**: End of the sheet tabs (top of dialog)

```
[ Main Building ] [ Porch ] [ + Add Sheet ] ← Click this button!
```

- Look for a **dashed border button** that says "Add Sheet"
- Click it to create a new sheet (e.g., "Garage", "Deck", "Interior")
- ⚠️ **Only shows for working (unlocked) workbooks**

---

### ✨ Feature 2: Delete Sheet
**Location**: Hover over any sheet tab

```
[ Main Building ⚊ ] ← Hover here to see the X button
```

- **Hover** your mouse over any sheet tab
- An **X button** will appear on the right side (red color)
- Click it to delete the sheet
- ⚠️ **Cannot delete the last sheet** - workbooks must have at least one sheet
- ⚠️ **Only shows for working (unlocked) workbooks**

---

### ✨ Feature 3: Add Materials from Catalog
**Location**: Top-right corner, next to sheet tabs

```
                                    [ 🔍 Add from Catalog ] ← Click this!
```

- Look for a **blue button** that says "Add from Catalog"
- Opens a searchable dialog with all materials from the database
- Search by name, SKU, or category
- Click "Add" to add materials to the current sheet
- ⚠️ **Only shows for working (unlocked) workbooks**

---

## 🚫 Why You Might Not See These Buttons

### ❌ Locked Workbook
If you're viewing a **locked version**, you won't see these buttons because:
- Locked workbooks are read-only
- They represent finalized pricing/quotes
- Only working versions can be edited

### ❌ No Workbook Open
The buttons only appear **inside the workbook view dialog**:
- You must click "View" on a working version first
- They won't appear on the main workbook list page

---

## 📋 Quick Checklist

- [ ] I have at least one **Working Version** (green card)
- [ ] I clicked the **"View"** button on the working version
- [ ] The workbook view dialog is now open
- [ ] I can see the sheet tabs at the top
- [ ] I can see the "Add Sheet" button at the end of the tabs
- [ ] When I hover over a sheet tab, I see the X button
- [ ] I can see the blue "Add from Catalog" button (top-right)

---

## 🎬 Visual Walkthrough

### Step 1: Find Working Version
```
┌─────────────────────────────────────────┐
│ 🔓 Working Version (v1)                 │ ← Green card
│ ┌─────────┐ ┌────────┐ ┌──────────┐    │
│ │  View   │ │  Lock  │ │  Delete  │    │ ← Click View
│ └─────────┘ └────────┘ └──────────┘    │
└─────────────────────────────────────────┘
```

### Step 2: Inside View Dialog
```
┌──────────────────────────────────────────────────────────┐
│ Version 1 - Working                                      │
│                                                          │
│ ┌──────────┬─────────┬────────────┐  ┌─────────────┐   │
│ │ Main     │ Porch   │ + Add      │  │ 🔍 Add from │   │
│ │ Building │         │   Sheet    │  │   Catalog   │   │
│ └──────────┴─────────┴────────────┘  └─────────────┘   │
│   ↑ Hover to see X                     ↑ Blue button    │
│                                                          │
│ [ Material table here... ]                              │
└──────────────────────────────────────────────────────────┘
```

---

## 💡 Tips

1. **Add Sheet** is most useful when you have different building sections (Main, Porch, Garage, etc.)
2. **Delete Sheet** requires confirmation - you can't accidentally delete
3. **Add from Catalog** is faster than manual entry - just search and click
4. All changes save immediately to the database
5. You can switch between sheets by clicking the sheet tab buttons

---

## 🐛 Still Not Seeing the Features?

If you've followed all steps and still don't see the buttons:

1. **Refresh the page** - Sometimes React state needs a refresh
2. **Check browser console** - Press F12 and look for errors
3. **Verify workbook status** - Make sure it says "Working" not "Locked"
4. **Try creating a new working version** - Upload a new workbook

---

## ✅ Success Indicators

You'll know the features are working when:
- ✅ You can click "Add Sheet" and see a dialog
- ✅ You can hover over a sheet and see the X button
- ✅ You can click "Add from Catalog" and see the materials database
- ✅ New sheets appear immediately after creation
- ✅ Materials added from catalog appear in the table
