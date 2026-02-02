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

export async function getJobs(): Promise<any[]> {
  return fetchOfflineFirst('jobs', async () => {
    const result = await supabase.from('jobs').select('*').order('created_at', { ascending: false });
    return { data: result.data || [], error: result.error };
  });
}

export async function getActiveJobs(): Promise<any[]> {
  return fetchByIndexOfflineFirst('jobs', 'status', 'active', async () => {
    const result = await supabase.from('jobs').select('*').eq('status', 'active').order('created_at', { ascending: false });
    return { data: result.data || [], error: result.error };
  });
}

export async function getComponents(): Promise<any[]> {
  return fetchOfflineFirst('components', async () => {
    const result = await supabase.from('components').select('*').eq('archived', false).order('name');
    return { data: result.data || [], error: result.error };
  });
}

export async function getWorkers(): Promise<any[]> {
  return fetchOfflineFirst('workers', async () => {
    const result = await supabase.from('workers').select('*').eq('active', true).order('name');
    return { data: result.data || [], error: result.error };
  });
}

export async function getTimeEntriesByJob(jobId: string): Promise<any[]> {
  return fetchByIndexOfflineFirst('time_entries', 'job_id', jobId, async () => {
    const result = await supabase
      .from('time_entries')
      .select('*, component:components(*), user:user_profiles(*)')
      .eq('job_id', jobId)
      .order('start_time', { ascending: false });
    return { data: result.data || [], error: result.error };
  });
}

export async function getDailyLogsByJob(jobId: string): Promise<any[]> {
  return fetchByIndexOfflineFirst('daily_logs', 'job_id', jobId, async () => {
    const result = await supabase
      .from('daily_logs')
      .select('*')
      .eq('job_id', jobId)
      .order('log_date', { ascending: false });
    return { data: result.data || [], error: result.error };
  });
}

export async function getPhotosByJob(jobId: string): Promise<any[]> {
  return fetchByIndexOfflineFirst('photos', 'job_id', jobId, async () => {
    const result = await supabase
      .from('photos')
      .select('*')
      .eq('job_id', jobId)
      .order('photo_date', { ascending: false });
    return { data: result.data || [], error: result.error };
  });
}

export async function getActiveTimeEntries(userId: string): Promise<any[]> {
  return fetchByIndexOfflineFirst('time_entries', 'is_active', true, async () => {
    const result = await supabase
      .from('time_entries')
      .select('*, job:jobs(*), component:components(*)')
      .eq('user_id', userId)
      .eq('is_active', true);
    return { data: result.data || [], error: result.error };
  });
}
