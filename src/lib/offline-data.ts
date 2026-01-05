// Offline-first data access layer
// Reads from IndexedDB first, falls back to Supabase

import { supabase } from './supabase';
import { getAll, getById, getByIndex } from './offline-db';
import { isOnline } from './offline-manager';
import { syncTable, isDataStale } from './offline-sync';

// Generic offline-first fetch
export async function fetchOfflineFirst<T>(
  tableName: string,
  fetchFromSupabase: () => Promise<{ data: T[] | null; error: any }>
): Promise<T[]> {
  try {
    // Always try IndexedDB first
    const cachedData = await getAll<T>(tableName);

    // If we have cached data and we're offline, return it
    if (cachedData.length > 0 && !isOnline()) {
      console.log(`[OfflineData] Using cached ${tableName} (offline)`);
      return cachedData;
    }

    // If we're online and data is stale, refresh from server
    if (isOnline() && (cachedData.length === 0 || isDataStale(tableName))) {
      console.log(`[OfflineData] Refreshing ${tableName} from server...`);
      
      const { data, error } = await fetchFromSupabase();
      
      if (error) {
        console.error(`[OfflineData] Server fetch failed for ${tableName}:`, error);
        // Fall back to cached data if available
        return cachedData;
      }

      // Update cache and return fresh data
      if (data) {
        await syncTable(tableName as any);
        return data;
      }
    }

    // Return cached data
    console.log(`[OfflineData] Using cached ${tableName}`);
    return cachedData;
  } catch (error) {
    console.error(`[OfflineData] Error fetching ${tableName}:`, error);
    return [];
  }
}

// Fetch by ID with offline support
export async function fetchByIdOfflineFirst<T>(
  tableName: string,
  id: string,
  fetchFromSupabase: () => Promise<{ data: T | null; error: any }>
): Promise<T | null> {
  try {
    // Try IndexedDB first
    const cachedItem = await getById<T>(tableName, id);

    // If offline, return cached item
    if (!isOnline()) {
      console.log(`[OfflineData] Using cached ${tableName}/${id} (offline)`);
      return cachedItem || null;
    }

    // If online, try to fetch fresh data
    const { data, error } = await fetchFromSupabase();

    if (error) {
      console.error(`[OfflineData] Server fetch failed for ${tableName}/${id}:`, error);
      return cachedItem || null;
    }

    return data;
  } catch (error) {
    console.error(`[OfflineData] Error fetching ${tableName}/${id}:`, error);
    return null;
  }
}

// Fetch by index with offline support
export async function fetchByIndexOfflineFirst<T>(
  tableName: string,
  indexName: string,
  value: any,
  fetchFromSupabase: () => Promise<{ data: T[] | null; error: any }>
): Promise<T[]> {
  try {
    // Try IndexedDB first
    const cachedData = await getByIndex<T>(tableName, indexName, value);

    // If offline, return cached data
    if (!isOnline()) {
      console.log(`[OfflineData] Using cached ${tableName} by ${indexName} (offline)`);
      return cachedData;
    }

    // If online and data might be stale, refresh
    if (isDataStale(tableName)) {
      const { data, error } = await fetchFromSupabase();

      if (error) {
        console.error(`[OfflineData] Server fetch failed:`, error);
        return cachedData;
      }

      if (data) {
        return data;
      }
    }

    return cachedData;
  } catch (error) {
    console.error(`[OfflineData] Error:`, error);
    return [];
  }
}

// Convenience functions for common queries

export async function getJobs() {
  return fetchOfflineFirst('jobs', () =>
    supabase.from('jobs').select('*').order('created_at', { ascending: false })
  );
}

export async function getActiveJobs() {
  return fetchByIndexOfflineFirst('jobs', 'status', 'active', () =>
    supabase.from('jobs').select('*').eq('status', 'active').order('created_at', { ascending: false })
  );
}

export async function getComponents() {
  return fetchOfflineFirst('components', () =>
    supabase.from('components').select('*').eq('archived', false).order('name')
  );
}

export async function getWorkers() {
  return fetchOfflineFirst('workers', () =>
    supabase.from('workers').select('*').eq('active', true).order('name')
  );
}

export async function getTimeEntriesByJob(jobId: string) {
  return fetchByIndexOfflineFirst('time_entries', 'job_id', jobId, () =>
    supabase
      .from('time_entries')
      .select('*, component:components(*), user:user_profiles(*)')
      .eq('job_id', jobId)
      .order('start_time', { ascending: false })
  );
}

export async function getDailyLogsByJob(jobId: string) {
  return fetchByIndexOfflineFirst('daily_logs', 'job_id', jobId, () =>
    supabase
      .from('daily_logs')
      .select('*')
      .eq('job_id', jobId)
      .order('log_date', { ascending: false })
  );
}

export async function getPhotosByJob(jobId: string) {
  return fetchByIndexOfflineFirst('photos', 'job_id', jobId, () =>
    supabase
      .from('photos')
      .select('*')
      .eq('job_id', jobId)
      .order('photo_date', { ascending: false })
  );
}

export async function getActiveTimeEntries(userId: string) {
  return fetchByIndexOfflineFirst('time_entries', 'is_active', true, () =>
    supabase
      .from('time_entries')
      .select('*, job:jobs(*), component:components(*)')
      .eq('user_id', userId)
      .eq('is_active', true)
  );
}
