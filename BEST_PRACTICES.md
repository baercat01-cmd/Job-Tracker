# Development Best Practices for Large-Scale React Applications

This document outlines critical best practices to prevent crashes and maintain code quality as your application grows.

## 🚨 Critical Issues We Just Fixed

### Missing UI Components
**Problem:** The app was importing UI components (`Select`, `Textarea`, `Checkbox`, `Switch`, `RadioGroup`, `DropdownMenu`, `Calendar`) that didn't exist.

**Solution:** Always ensure all imported components exist before using them.

**Prevention:**
- Run the app frequently during development to catch import errors early
- Use TypeScript's type checking to catch missing imports at compile time
- Create a checklist of commonly used shadcn/ui components and ensure they all exist

---

## 📋 Essential Best Practices

### 1. **Component Organization**

#### ✅ DO:
```typescript
// Keep components under 200 lines
// Split large components into smaller, focused pieces

// ✅ Good: Focused, single-responsibility components
const UserCard = ({ user }) => { /* ... */ }
const UserActions = ({ userId }) => { /* ... */ }
const UserStats = ({ stats }) => { /* ... */ }
```

#### ❌ DON'T:
```typescript
// ❌ Bad: 1000+ line mega-component
const UserDashboard = () => {
  // Mixing UI, business logic, API calls, state management...
  // This becomes unmaintainable
}
```

**Your Code Status:** ⚠️ **WARNING**
- `JobDetailedView.tsx` is over 1200 lines - needs refactoring
- `WorkbookDetailPage.tsx` is complex - consider splitting
- `TrimPricingCalculator.tsx` has multiple dialogs - extract them

**Action Plan:**
```
JobDetailedView.tsx → Split into:
  - JobHeader.tsx (navigation, title)
  - JobTabs.tsx (tab navigation)
  - OverviewTab.tsx
  - FinancialsTab.tsx
  - ComponentsTab.tsx
  etc.
```

---

### 2. **Import Management**

#### ✅ DO:
```typescript
// Always verify imports exist
import { Button } from '@/components/ui/button' // ✓ Exists
import { Select } from '@/components/ui/select' // ✓ Exists

// Use named exports for components
export function MyComponent() { }

// Use default exports for pages
export default function MyPage() { }
```

#### ❌ DON'T:
```typescript
// ❌ Import non-existent files
import { FakeComponent } from '@/components/fake'

// ❌ Mix export styles inconsistently
export default function SomeComponent() { } // In one file
export function SomeComponent() { } // In another file - CONFUSING!
```

---

### 3. **State Management**

#### ✅ DO:
```typescript
// Keep local state close to where it's used
function MaterialRow({ material }) {
  const [isEditing, setIsEditing] = useState(false)
  // ...
}

// Use React Query for server state
const { data: materials } = useQuery({
  queryKey: ['materials', jobId],
  queryFn: () => fetchMaterials(jobId)
})

// Lift state only when needed
function ParentWithSharedState() {
  const [selectedItems, setSelectedItems] = useState([])
  return (
    <>
      <ChildA selectedItems={selectedItems} />
      <ChildB setSelectedItems={setSelectedItems} />
    </>
  )
}
```

#### ❌ DON'T:
```typescript
// ❌ Don't lift all state to top level unnecessarily
function App() {
  const [materialEditingState, setMaterialEditingState] = useState({})
  const [materialDialogOpen, setMaterialDialogOpen] = useState(false)
  const [materialSearchQuery, setMaterialSearchQuery] = useState('')
  // ... 50 more state variables that are only used in one component
}
```

---

### 4. **Error Handling**

#### ✅ DO:
```typescript
// Graceful error handling with user feedback
const handleSave = async () => {
  try {
    await saveMaterial(data)
    toast.success('Material saved successfully')
  } catch (error) {
    console.error('Save failed:', error)
    toast.error(`Failed to save: ${error.message}`)
  }
}

// Provide fallback UI
const { data, error } = useQuery(...)
if (error) return <ErrorDisplay message="Failed to load materials" />
if (!data) return <LoadingSpinner />
```

#### ❌ DON'T:
```typescript
// ❌ Silent failures
const handleSave = async () => {
  await saveMaterial(data) // No error handling - app crashes!
}

// ❌ Generic error messages
catch (error) {
  alert('Error') // Not helpful!
}
```

---

### 5. **Performance Optimization**

#### ✅ DO:
```typescript
// Memoize expensive computations
const totalCost = useMemo(() => 
  materials.reduce((sum, m) => sum + m.cost, 0),
  [materials]
)

// Memoize callbacks passed to children
const handleItemClick = useCallback((id) => {
  setSelectedId(id)
}, [])

// Use proper keys in lists
{materials.map(material => (
  <MaterialRow key={material.id} material={material} />
))}

// Virtualize long lists (100+ items)
import { useVirtualizer } from '@tanstack/react-virtual'
```

#### ❌ DON'T:
```typescript
// ❌ Recalculate on every render
const totalCost = materials.reduce((sum, m) => sum + m.cost, 0)

// ❌ Create new functions on every render
<Button onClick={() => handleClick(id)} />

// ❌ Use index as key
{materials.map((material, index) => (
  <MaterialRow key={index} material={material} /> // BAD!
))}
```

---

### 6. **Type Safety**

#### ✅ DO:
```typescript
// Define proper types
interface Material {
  id: string
  name: string
  quantity: number
  cost: number
}

// Use strict types
function updateMaterial(material: Material): Promise<Material> {
  return supabase
    .from('materials')
    .update(material)
    .eq('id', material.id)
    .select()
    .single()
}

// Avoid 'any'
const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  // TypeScript knows e.target.value is a string
}
```

#### ❌ DON'T:
```typescript
// ❌ Using 'any' everywhere
function updateMaterial(data: any): any {
  return supabase.from('materials').update(data)
}

// ❌ No type definitions
const material = { /* ... */ } // What properties does this have?
```

---

### 7. **Database Operations**

#### ✅ DO:
```typescript
// Check for errors
const { data, error } = await supabase
  .from('materials')
  .select('*')
  
if (error) {
  console.error('Database error:', error)
  throw error
}

// Use transactions for related operations
const { error } = await supabase.rpc('create_job_with_materials', {
  job_data: jobData,
  materials: materials
})

// Optimize queries with specific selects
.select('id, name, quantity') // Not .select('*')
```

#### ❌ DON'T:
```typescript
// ❌ Ignore errors
const { data } = await supabase.from('materials').select('*')
// What if there's an error? App crashes!

// ❌ N+1 queries
for (const material of materials) {
  await supabase.from('materials').update({ ... }).eq('id', material.id)
}
// Use batch operations instead!

// ❌ Fetch unnecessary data
.select('*') // When you only need 2 fields
```

---

### 8. **Code Duplication**

#### ✅ DO:
```typescript
// Extract common patterns into reusable hooks
function useMaterialCRUD(jobId: string) {
  const queryClient = useQueryClient()
  
  const { data: materials } = useQuery({
    queryKey: ['materials', jobId],
    queryFn: () => fetchMaterials(jobId)
  })
  
  const createMutation = useMutation({
    mutationFn: createMaterial,
    onSuccess: () => queryClient.invalidateQueries(['materials'])
  })
  
  return { materials, createMaterial: createMutation.mutate }
}

// Extract common UI patterns
function StatusBadge({ status }: { status: string }) {
  const variants = {
    active: 'bg-green-500',
    pending: 'bg-yellow-500',
    completed: 'bg-blue-500'
  }
  return <Badge className={variants[status]}>{status}</Badge>
}
```

#### ❌ DON'T:
```typescript
// ❌ Copy-paste the same code everywhere
// Component A
const { data } = await supabase.from('materials').select('*')
if (data) setMaterials(data)

// Component B
const { data } = await supabase.from('materials').select('*')
if (data) setMaterials(data)

// Component C
const { data } = await supabase.from('materials').select('*')
if (data) setMaterials(data)
```

---

### 9. **Testing During Development**

#### ✅ DO:
```typescript
// Test frequently
// 1. Save file
// 2. Check browser for errors
// 3. Test the feature you just added
// 4. Check console for warnings

// Add logging during development
console.log('Materials loaded:', materials.length)
console.log('Selected item:', selectedItem)

// Use React DevTools to inspect state
```

#### ❌ DON'T:
```typescript
// ❌ Make 50 changes then test
// ❌ Ignore console warnings
// ❌ Skip testing edge cases (empty lists, null values, etc.)
```

---

### 10. **File Organization**

#### ✅ Current Structure (Good):
```
src/
├── components/
│   ├── office/      # Office-specific components
│   ├── foreman/     # Foreman-specific components
│   ├── fleet/       # Fleet-specific components
│   └── ui/          # Reusable UI components
├── pages/           # Route components
├── hooks/           # Custom hooks
├── lib/             # Utilities and helpers
└── types/           # TypeScript types
```

#### ✅ Maintain This:
- Keep related files together
- Use clear, descriptive names
- One component per file
- Co-locate related files (component + styles + tests)

---

## 🎯 Immediate Action Items for Your Project

### Priority 1: Component Splitting
```
[ ] Split JobDetailedView.tsx into smaller components
[ ] Extract dialogs from TrimPricingCalculator.tsx
[ ] Break down MaterialWorkbookManager.tsx tabs
```

### Priority 2: Error Boundaries
```
[ ] Add error boundary to main routes
[ ] Add error boundary to each major feature section
[ ] Implement fallback UI for errors
```

### Priority 3: Performance
```
[ ] Add virtualization to material lists (100+ items)
[ ] Memoize expensive calculations in TrimPricingCalculator
[ ] Optimize database queries (use specific selects)
```

### Priority 4: Type Safety
```
[ ] Define interfaces for all database tables
[ ] Remove any 'any' types
[ ] Add proper types to all function parameters
```

---

## 🔍 Regular Maintenance Checklist

**Daily:**
- [ ] Check browser console for errors/warnings
- [ ] Test new features before committing
- [ ] Run app in development mode frequently

**Weekly:**
- [ ] Review component sizes (keep under 200 lines)
- [ ] Check for code duplication
- [ ] Optimize slow queries/renders

**Monthly:**
- [ ] Audit dependencies (remove unused)
- [ ] Review and update type definitions
- [ ] Refactor problem areas identified during development

---

## 🚀 Performance Monitoring

### Watch for these warning signs:
- Components over 300 lines → **Split them**
- Re-renders on every keystroke → **Add debouncing**
- Slow list scrolling → **Add virtualization**
- Multiple database calls for same data → **Use React Query**
- Console warnings → **Fix them immediately**

---

## 📚 Resources

- [React Best Practices](https://react.dev/learn/thinking-in-react)
- [React Query Documentation](https://tanstack.com/query/latest)
- [TypeScript Best Practices](https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html)
- [Supabase Best Practices](https://supabase.com/docs/guides/database/joins-and-nesting)

---

## 💡 Remember

> "Code is read far more often than it is written. Optimize for readability and maintainability."

**The cost of bad code compounds over time. The cost of good code pays dividends forever.**
