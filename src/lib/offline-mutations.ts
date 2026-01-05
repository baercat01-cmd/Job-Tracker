// Offline-first mutation layer
// Handles create/update/delete operations with offline support

import { supabase } from './supabase';
import { put, remove, addToSyncQueue } from './offline-db';
import { isOnline } from './offline-manager';
import { syncTable } from './offline-sync';

// Generic create operation with offline support
export async function createOffline<T extends { id?: string }>(
  tableName: string,
  data: T
): Promise<{ data: T | null; error: any }> {
  try {
    // If online, try to create on server first
    if (isOnline()) {
      const { data: serverData, error } = await supabase
        .from(tableName)
        .insert(data)
        .select()
        .single();

      if (!error && serverData) {
        // Store in local cache
        await put(tableName, serverData);
        console.log(`[Mutations] ✓ Created ${tableName} online`);
        return { data: serverData as T, error: null };
      }

      // If server error, fall through to offline mode
      console.warn(`[Mutations] Server create failed, queueing for ${tableName}:`, error);
    }

    // Offline or server failed - generate temporary ID and queue
    const tempId = data.id || `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const offlineData = { ...data, id: tempId } as T;

    // Store locally
    await put(tableName, offlineData);

    // Queue for sync
    await addToSyncQueue({
      table: tableName,
      operation: 'insert',
      data: offlineData,
      recordId: tempId,
    });

    console.log(`[Mutations] ⏱ Queued create for ${tableName} (offline)`);
    return { data: offlineData, error: null };
  } catch (error) {
    console.error(`[Mutations] Create failed for ${tableName}:`, error);
    return { data: null, error };
  }
}

// Generic update operation with offline support
export async function updateOffline<T extends { id: string }>(
  tableName: string,
  id: string,
  updates: Partial<T>
): Promise<{ data: T | null; error: any }> {
  try {
    // If online, try to update on server first
    if (isOnline()) {
      const { data: serverData, error } = await supabase
        .from(tableName)
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (!error && serverData) {
        // Update local cache
        await put(tableName, serverData);
        console.log(`[Mutations] ✓ Updated ${tableName}/${id} online`);
        return { data: serverData as T, error: null };
      }

      console.warn(`[Mutations] Server update failed for ${tableName}/${id}:`, error);
    }

    // Offline or server failed - update locally and queue
    // First, get current data from local cache
    const { getById } = await import('./offline-db');
    const currentData = await getById<T>(tableName, id);

    if (!currentData) {
      return { data: null, error: new Error('Record not found in local cache') };
    }

    const updatedData = { ...currentData, ...updates, updated_at: new Date().toISOString() };

    // Store locally
    await put(tableName, updatedData);

    // Queue for sync
    await addToSyncQueue({
      table: tableName,
      operation: 'update',
      data: updates,
      recordId: id,
    });

    console.log(`[Mutations] ⏱ Queued update for ${tableName}/${id} (offline)`);
    return { data: updatedData, error: null };
  } catch (error) {
    console.error(`[Mutations] Update failed for ${tableName}/${id}:`, error);
    return { data: null, error };
  }
}

// Generic delete operation with offline support
export async function deleteOffline(
  tableName: string,
  id: string
): Promise<{ error: any }> {
  try {
    // If online, try to delete on server first
    if (isOnline()) {
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', id);

      if (!error) {
        // Remove from local cache
        await remove(tableName, id);
        console.log(`[Mutations] ✓ Deleted ${tableName}/${id} online`);
        return { error: null };
      }

      console.warn(`[Mutations] Server delete failed for ${tableName}/${id}:`, error);
    }

    // Offline or server failed - remove locally and queue
    await remove(tableName, id);

    // Queue for sync
    await addToSyncQueue({
      table: tableName,
      operation: 'delete',
      data: null,
      recordId: id,
    });

    console.log(`[Mutations] ⏱ Queued delete for ${tableName}/${id} (offline)`);
    return { error: null };
  } catch (error) {
    console.error(`[Mutations] Delete failed for ${tableName}/${id}:`, error);
    return { error };
  }
}

// Specific helper functions for common operations

export async function createTimeEntry(data: any) {
  return createOffline('time_entries', {
    ...data,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

export async function updateTimeEntry(id: string, updates: any) {
  return updateOffline('time_entries', id, updates);
}

export async function deleteTimeEntry(id: string) {
  return deleteOffline('time_entries', id);
}

export async function createDailyLog(data: any) {
  return createOffline('daily_logs', {
    ...data,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

export async function updateDailyLog(id: string, updates: any) {
  return updateOffline('daily_logs', id, updates);
}

export async function createPhoto(data: any) {
  return createOffline('photos', {
    ...data,
    timestamp: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });
}

export async function deletePhoto(id: string) {
  return deleteOffline('photos', id);
}

export async function createMaterial(data: any) {
  return createOffline('materials', {
    ...data,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

export async function updateMaterial(id: string, updates: any) {
  return updateOffline('materials', id, updates);
}

export async function deleteMaterial(id: string) {
  return deleteOffline('materials', id);
}

export async function createJob(data: any) {
  return createOffline('jobs', {
    ...data,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

export async function updateJob(id: string, updates: any) {
  return updateOffline('jobs', id, updates);
}

export async function createComponent(data: any) {
  return createOffline('components', {
    ...data,
    created_at: new Date().toISOString(),
  });
}

export async function updateComponent(id: string, updates: any) {
  return updateOffline('components', id, updates);
}

export async function createWorker(data: any) {
  return createOffline('workers', {
    ...data,
    created_at: new Date().toISOString(),
  });
}

export async function updateWorker(id: string, updates: any) {
  return updateOffline('workers', id, updates);
}
