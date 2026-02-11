# Auto-Refresh Implementation Guide

## Overview

Since OnSpace Cloud doesn't support real-time features, we've implemented a polling-based auto-refresh system to keep data synchronized across users without requiring manual page refreshes.

## Core Components

### 1. `usePolling` Hook (`src/hooks/usePolling.tsx`)

Base hook for polling data at regular intervals:

```typescript
const { data, loading, error, lastUpdated, refresh } = usePolling(
  async () => {
    const result = await fetchData();
    return result;
  },
  {
    interval: 5000, // milliseconds
    enabled: true,
    onError: (error) => console.error(error)
  }
);
```

### 2. `useVisibilityPolling` Hook

Enhanced version that pauses when tab is not visible to save resources:

```typescript
const { data, lastUpdated, refresh } = useVisibilityPolling(
  fetchFunction,
  { interval: 5000 }
);
```

### 3. `AutoRefreshIndicator` Component

Visual indicator showing when data was last updated:

```tsx
<AutoRefreshIndicator lastUpdated={lastUpdated} />
```

## Implementation Pattern

### Step 1: Import the hooks

```typescript
import { useVisibilityPolling } from '@/hooks/usePolling';
import { AutoRefreshIndicator } from '@/components/ui/auto-refresh-indicator';
```

### Step 2: Set up polling in your component

```typescript
function MyComponent() {
  const [data, setData] = useState([]);
  
  // Define your data loading function
  async function loadData() {
    const { data } = await supabase
      .from('table_name')
      .select('*');
    
    setData(data || []);
  }
  
  // Set up polling
  const { lastUpdated, refresh } = useVisibilityPolling(
    async () => {
      await loadData();
      return null;
    },
    {
      interval: 5000, // Refresh every 5 seconds
      enabled: true,
    }
  );
  
  // Initial load
  useEffect(() => {
    loadData();
  }, []);
  
  return (
    <div>
      <AutoRefreshIndicator lastUpdated={lastUpdated} />
      {/* Your component content */}
    </div>
  );
}
```

### Step 3: Add manual refresh (optional)

```typescript
<Button onClick={refresh}>
  <RefreshCw className="w-4 h-4 mr-2" />
  Refresh Now
</Button>
```

## Components That Should Use Auto-Refresh

### High Priority (5-10 second intervals)
- ✅ **JobFinancials** - Already implemented
- **JobsView** - Job list and status changes
- **MaterialsManagement** - Material orders and updates
- **TimeEntriesView** - Active time tracking
- **DailyLogsView** - Field updates
- **JobTasksManagement** - Task status changes

### Medium Priority (15-30 second intervals)
- **PhotosView** - New photo uploads
- **MaterialOrdersManagement** - Order status
- **SubcontractorScheduling** - Schedule changes
- **JobCalendar** - Calendar events

### Low Priority (60 second intervals)
- **JobBudgetManagement** - Budget updates
- **ComponentsManagement** - Component library changes
- **UserManagement** - User changes

## Best Practices

### 1. Choose Appropriate Intervals

```typescript
// High-activity data (jobs, materials, tasks)
{ interval: 5000 }  // 5 seconds

// Medium-activity data (photos, schedules)
{ interval: 15000 } // 15 seconds

// Low-activity data (budgets, settings)
{ interval: 60000 } // 60 seconds
```

### 2. Use Visibility Detection

Always use `useVisibilityPolling` instead of `usePolling` to pause when tab is not visible:

```typescript
// ✅ Good - pauses when tab hidden
const { lastUpdated } = useVisibilityPolling(fetchFn, { interval: 5000 });

// ❌ Bad - continues polling when hidden
const { lastUpdated } = usePolling(fetchFn, { interval: 5000 });
```

### 3. Silent Background Updates

Don't show loading spinners for background updates:

```typescript
async function loadData() {
  try {
    // Don't set loading state for background updates
    const { data } = await supabase.from('table').select('*');
    setData(data || []);
  } catch (error) {
    console.error('Error loading data:', error);
  }
}
```

### 4. Optimistic Updates

For better UX, update UI immediately on user actions, then refresh from server:

```typescript
async function updateItem(id, newData) {
  // Optimistic update
  setItems(prev => prev.map(item => 
    item.id === id ? { ...item, ...newData } : item
  ));
  
  // Server update
  await supabase.from('table').update(newData).eq('id', id);
  
  // Force refresh to ensure consistency
  refresh();
}
```

### 5. Error Handling

Handle errors gracefully without disrupting polling:

```typescript
const { lastUpdated } = useVisibilityPolling(
  async () => {
    try {
      await loadData();
    } catch (error) {
      console.error('Polling error:', error);
      // Don't throw - let polling continue
    }
    return null;
  },
  { interval: 5000 }
);
```

## Example: Complete Implementation

```typescript
import { useState, useEffect } from 'react';
import { useVisibilityPolling } from '@/hooks/usePolling';
import { AutoRefreshIndicator } from '@/components/ui/auto-refresh-indicator';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

function JobTasksList({ jobId }: { jobId: string }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  
  async function loadTasks() {
    try {
      const { data, error } = await supabase
        .from('job_tasks')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error('Error loading tasks:', error);
    } finally {
      setLoading(false);
    }
  }
  
  // Set up auto-refresh
  const { lastUpdated, refresh } = useVisibilityPolling(
    async () => {
      await loadTasks();
      return null;
    },
    {
      interval: 5000, // 5 seconds
      enabled: true,
    }
  );
  
  // Initial load
  useEffect(() => {
    loadTasks();
  }, [jobId]);
  
  async function toggleTaskStatus(taskId: string, currentStatus: string) {
    const newStatus = currentStatus === 'pending' ? 'completed' : 'pending';
    
    // Optimistic update
    setTasks(prev => prev.map(task =>
      task.id === taskId ? { ...task, status: newStatus } : task
    ));
    
    // Server update
    try {
      const { error } = await supabase
        .from('job_tasks')
        .update({ status: newStatus })
        .eq('id', taskId);
      
      if (error) throw error;
      
      toast.success('Task updated');
      refresh(); // Force immediate refresh
    } catch (error) {
      toast.error('Failed to update task');
      // Revert optimistic update
      loadTasks();
    }
  }
  
  if (loading) {
    return <div>Loading...</div>;
  }
  
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2>Tasks</h2>
        <AutoRefreshIndicator lastUpdated={lastUpdated} />
      </div>
      
      <div className="space-y-2">
        {tasks.map(task => (
          <div key={task.id} className="border p-3 rounded">
            <h3>{task.title}</h3>
            <button onClick={() => toggleTaskStatus(task.id, task.status)}>
              {task.status === 'pending' ? 'Mark Complete' : 'Mark Pending'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Performance Considerations

1. **Network Usage**: Each component polls independently. Combine related data into single queries when possible.

2. **Battery Usage**: Polling pauses when tab is hidden to conserve battery on mobile devices.

3. **Server Load**: Stagger intervals across components to avoid simultaneous requests.

4. **Memory**: Polling hooks clean up automatically when components unmount.

## Testing

Test auto-refresh functionality:

1. Open the app in two browser tabs/windows
2. Make a change in one tab (add job, update material, etc.)
3. Within 5-10 seconds, the change should appear in the other tab
4. Switch to another browser tab - polling should pause
5. Switch back - polling should resume and show latest data

## Migration Checklist

For each component that needs auto-refresh:

- [ ] Import `useVisibilityPolling` and `AutoRefreshIndicator`
- [ ] Wrap data loading in polling hook
- [ ] Add `AutoRefreshIndicator` to UI
- [ ] Choose appropriate interval based on data update frequency
- [ ] Test with multiple browser tabs
- [ ] Verify polling pauses when tab is hidden
- [ ] Ensure optimistic updates work correctly
