# How to Add Database Search to MaterialsManagement.tsx

## Step 1: Add State Variables (After line 119)

After the line `const [saving, setSaving] = useState(false);`, add:

```typescript
  // Database search state for add dialog
  const [showDatabaseSearch, setShowDatabaseSearch] = useState(false);
  const [catalogMaterials, setCatalogMaterials] = useState<any[]>([]);
  const [catalogSearchQuery, setCatalogSearchQuery] = useState('');
  const [catalogSearchCategory, setCatalogSearchCategory] = useState<string>('all');
  const [catalogCategories, setCatalogCategories] = useState<string[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
```

## Step 2: Add Load Catalog Function (Before openAddDialog function, around line 458)

```typescript
  async function loadCatalogMaterials() {
    try {
      setLoadingCatalog(true);
      
      const { data, error } = await supabase
        .from('materials_catalog')
        .select('*')
        .order('category')
        .order('material_name');

      if (error) throw error;

      setCatalogMaterials(data || []);
      
      // Extract unique categories
      const uniqueCategories = [...new Set(data?.map(m => m.category).filter(Boolean))] as string[];
      setCatalogCategories(uniqueCategories.sort());
    } catch (error: any) {
      console.error('Error loading catalog:', error);
      toast.error('Failed to load materials catalog');
    } finally {
      setLoadingCatalog(false);
    }
  }

  function selectMaterialFromCatalog(catalogItem: any) {
    // Auto-fill form with catalog data
    const cost = catalogItem.purchase_cost || 0;
    const markup = parseFloat(newMarkup) || 35;
    const price = cost * (1 + markup / 100);

    setNewMaterialName(catalogItem.material_name);
    setNewSku(catalogItem.sku || '');
    setNewLength(catalogItem.part_length || '');
    setNewCostPerUnit(cost.toString());
    setAddToCategory(catalogItem.category || addToCategory);
    
    setShowDatabaseSearch(false);
    setCatalogSearchQuery('');
    toast.success(`Material "${catalogItem.material_name}" loaded from database`);
  }
```

## Step 3: Update openAddDialog Function (Replace existing function around line 458)

```typescript
  function openAddDialog(categoryName?: string) {
    setAddToCategory(categoryName || '');
    setNewMaterialName('');
    setNewUsage('');
    setNewSku('');
    setNewQuantity('1');
    setNewLength('');
    setNewCostPerUnit('');
    setNewMarkup('35');
    setNewNotes('');
    setShowDatabaseSearch(false);  // ADD THIS LINE
    setCatalogSearchQuery('');      // ADD THIS LINE
    setCatalogSearchCategory('all'); // ADD THIS LINE
    setShowAddDialog(true);
    loadCatalogMaterials();         // ADD THIS LINE
  }
```

## Step 4: Update Add Material Dialog JSX (Around line 1118)

Replace the DialogHeader in the Add Material Dialog with:

```tsx
<DialogHeader>
  <DialogTitle className="flex items-center justify-between">
    <span>Add Material to {activeSheet?.sheet_name}</span>
    <Button
      variant="outline"
      size="sm"
      onClick={() => setShowDatabaseSearch(!showDatabaseSearch)}
      className="border-blue-500 text-blue-700 hover:bg-blue-50"
    >
      <Search className="w-4 h-4 mr-2" />
      {showDatabaseSearch ? 'Hide' : 'Search'} Database
    </Button>
  </DialogTitle>
</DialogHeader>
```

## Step 5: Add Database Search Section (Right after DialogHeader, before the grid of input fields)

```tsx
<div className="space-y-4">
  {/* Database Search Section */}
  {showDatabaseSearch && (
    <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <Search className="w-5 h-5 text-blue-700" />
        <h3 className="font-semibold text-blue-900">Search Materials Database</h3>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <div className="relative">
          <Input
            placeholder="Search by name, SKU, or category..."
            value={catalogSearchQuery}
            onChange={(e) => setCatalogSearchQuery(e.target.value)}
            className="pl-9"
          />
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        </div>
        
        <Select value={catalogSearchCategory} onValueChange={setCatalogSearchCategory}>
          <SelectTrigger>
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {catalogCategories.map(cat => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Search Results */}
      <div className="max-h-64 overflow-y-auto border rounded-lg bg-white">
        {(() => {
          const filtered = catalogMaterials.filter(material => {
            const matchesSearch = catalogSearchQuery === '' || 
              material.material_name.toLowerCase().includes(catalogSearchQuery.toLowerCase()) ||
              material.sku.toLowerCase().includes(catalogSearchQuery.toLowerCase()) ||
              (material.category && material.category.toLowerCase().includes(catalogSearchQuery.toLowerCase()));
            
            const matchesCategory = catalogSearchCategory === 'all' || material.category === catalogSearchCategory;
            
            return matchesSearch && matchesCategory;
          });

          if (loadingCatalog) {
            return (
              <div className="text-center py-8">
                <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Loading...</p>
              </div>
            );
          }

          if (filtered.length === 0) {
            return (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">No materials found</p>
              </div>
            );
          }

          return (
            <div className="divide-y">
              {filtered.slice(0, 10).map((material) => (
                <button
                  key={material.sku}
                  onClick={() => selectMaterialFromCatalog(material)}
                  className="w-full text-left p-3 hover:bg-blue-50 transition-colors flex items-center justify-between group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{material.material_name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground font-mono">{material.sku}</span>
                      {material.category && (
                        <Badge variant="outline" className="text-xs">
                          {material.category}
                        </Badge>
                      )}
                      {material.part_length && (
                        <span className="text-xs text-muted-foreground">{material.part_length}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right ml-4">
                    {material.purchase_cost && (
                      <p className="text-sm font-semibold">${material.purchase_cost.toFixed(2)}</p>
                    )}
                    <span className="text-xs text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">Click to use</span>
                  </div>
                </button>
              ))}
              {filtered.length > 10 && (
                <div className="p-2 text-center bg-slate-50">
                  <p className="text-xs text-muted-foreground">Showing 10 of {filtered.length} results - refine search to see more</p>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  )}

  {/* Rest of the form fields continue here... */}
  <div className="grid grid-cols-2 gap-4">
    {/* Material Name field */}
    ...
```

That's it! These changes will add the database search functionality to your Add Material dialog.
