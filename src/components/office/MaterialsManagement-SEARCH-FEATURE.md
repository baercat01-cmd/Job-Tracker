# Database Search Feature for Materials Management

## Changes Made

Added database search functionality to the "Add Material" dialog in MaterialsManagement.tsx to allow selecting materials from the materials_catalog database.

### 1. Added State Variables

```typescript
// Database search state for add dialog
const [showDatabaseSearch, setShowDatabaseSearch] = useState(false);
const [catalogMaterials, setCatalogMaterials] = useState<any[]>([]);
const [catalogSearchQuery, setCatalogSearchQuery] = useState('');
const [catalogSearchCategory, setCatalogSearchCategory] = useState<string>('all');
const [catalogCategories, setCatalogCategories] = useState<string[]>([]);
const [loadingCatalog, setLoadingCatalog] = useState(false);
```

### 2. Added Functions

```typescript
async function loadCatalogMaterials() {
  // Loads all materials from materials_catalog table
  // Extracts unique categories for filtering
}

function selectMaterialFromCatalog(catalogItem: any) {
  // Auto-fills the form with selected catalog material data
  // Calculates price based on cost and markup
}
```

### 3. Updated openAddDialog Function

- Now calls `loadCatalogMaterials()` when dialog opens
- Initializes search state variables

### 4. Modified Add Material Dialog UI

- Added "Search Database" button in the dialog header
- Added collapsible database search section
- Shows search input and category filter
- Displays up to 10 matching materials with click-to-select

## Implementation Details

The database search section:
1. Loads materials from `materials_catalog` table
2. Filters by search query (name, SKU, or category)
3. Filters by selected category
4. Shows results in a scrollable list
5. Clicking a material auto-fills the form fields
6. All form fields remain editable after selecting from database

This matches the functionality in MaterialWorkbookManager but is integrated into the Workbook tab's Add Material dialog.
