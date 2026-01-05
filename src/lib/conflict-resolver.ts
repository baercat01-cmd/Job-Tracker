// Conflict resolution for offline sync
// Handles cases where data changed both offline and online

import { supabase } from './supabase';
import { getById, put } from './offline-db';

export type ConflictResolution = 'local' | 'remote' | 'merge' | 'manual';

export interface Conflict<T = any> {
  table: string;
  recordId: string;
  localVersion: T;
  remoteVersion: T;
  localTimestamp: number;
  remoteTimestamp: number;
}

export interface ConflictStrategy {
  // Default resolution strategy
  defaultResolution: ConflictResolution;
  // Field-specific merge rules
  mergeRules?: Record<string, (local: any, remote: any) => any>;
  // Fields that should always use local value
  preferLocal?: string[];
  // Fields that should always use remote value
  preferRemote?: string[];
}

// Default conflict strategies per table
const DEFAULT_STRATEGIES: Record<string, ConflictStrategy> = {
  time_entries: {
    defaultResolution: 'local', // Prefer local time entries
    preferLocal: ['start_time', 'end_time', 'total_hours', 'crew_count', 'notes'],
    preferRemote: ['created_at'], // Server timestamp is authoritative
  },
  daily_logs: {
    defaultResolution: 'merge',
    mergeRules: {
      // Merge text fields by concatenating
      final_notes: (local, remote) => {
        if (local === remote) return local;
        return `${remote}\n\n[Offline addition:]\n${local}`;
      },
    },
    preferLocal: ['weather_details', 'crew_count'],
  },
  photos: {
    defaultResolution: 'local', // Photos created offline should be kept
  },
  materials: {
    defaultResolution: 'local', // Material changes in field are authoritative
    preferLocal: ['quantity', 'status', 'notes'],
    preferRemote: ['created_at', 'updated_at'],
  },
  jobs: {
    defaultResolution: 'remote', // Office changes to jobs take precedence
    preferLocal: [], // Field users rarely modify jobs
  },
  components: {
    defaultResolution: 'remote', // Office manages components
  },
};

// Detect if a conflict exists
export async function detectConflict<T extends { id: string; updated_at?: string }>(
  table: string,
  recordId: string,
  localData: T
): Promise<Conflict<T> | null> {
  try {
    // Fetch current remote version
    const { data: remoteData, error } = await supabase
      .from(table)
      .select('*')
      .eq('id', recordId)
      .single();

    if (error || !remoteData) {
      // No remote version = no conflict
      return null;
    }

    // Compare timestamps
    const localTimestamp = localData.updated_at 
      ? new Date(localData.updated_at).getTime()
      : 0;
    const remoteTimestamp = remoteData.updated_at
      ? new Date(remoteData.updated_at).getTime()
      : 0;

    // If remote is newer, we have a conflict
    if (remoteTimestamp > localTimestamp) {
      return {
        table,
        recordId,
        localVersion: localData,
        remoteVersion: remoteData as T,
        localTimestamp,
        remoteTimestamp,
      };
    }

    return null;
  } catch (error) {
    console.error('[Conflict Resolver] Error detecting conflict:', error);
    return null;
  }
}

// Resolve a conflict using the strategy
export async function resolveConflict<T>(
  conflict: Conflict<T>,
  strategy?: ConflictStrategy
): Promise<T> {
  const tableStrategy = strategy || DEFAULT_STRATEGIES[conflict.table] || {
    defaultResolution: 'remote',
  };

  switch (tableStrategy.defaultResolution) {
    case 'local':
      console.log(`[Conflict Resolver] Using local version for ${conflict.table}/${conflict.recordId}`);
      return conflict.localVersion;

    case 'remote':
      console.log(`[Conflict Resolver] Using remote version for ${conflict.table}/${conflict.recordId}`);
      return conflict.remoteVersion;

    case 'merge':
      console.log(`[Conflict Resolver] Merging versions for ${conflict.table}/${conflict.recordId}`);
      return mergeVersions(conflict, tableStrategy);

    case 'manual':
      // In a real app, this would show UI for user to choose
      console.log(`[Conflict Resolver] Manual resolution needed for ${conflict.table}/${conflict.recordId}`);
      // For now, default to remote
      return conflict.remoteVersion;

    default:
      return conflict.remoteVersion;
  }
}

// Merge two versions using the strategy rules
function mergeVersions<T>(
  conflict: Conflict<T>,
  strategy: ConflictStrategy
): T {
  const merged = { ...conflict.remoteVersion };
  const local = conflict.localVersion as any;
  const remote = conflict.remoteVersion as any;

  // Apply field-specific merge rules
  if (strategy.mergeRules) {
    for (const [field, mergeFn] of Object.entries(strategy.mergeRules)) {
      if (local[field] !== undefined && remote[field] !== undefined) {
        merged[field as keyof T] = mergeFn(local[field], remote[field]);
      }
    }
  }

  // Apply preferLocal fields
  if (strategy.preferLocal) {
    for (const field of strategy.preferLocal) {
      if (local[field] !== undefined) {
        merged[field as keyof T] = local[field];
      }
    }
  }

  // Apply preferRemote fields
  if (strategy.preferRemote) {
    for (const field of strategy.preferRemote) {
      if (remote[field] !== undefined) {
        merged[field as keyof T] = remote[field];
      }
    }
  }

  return merged as T;
}

// Resolve conflicts for a sync operation
export async function resolveAndSync<T extends { id: string; updated_at?: string }>(
  table: string,
  recordId: string,
  localData: T,
  operation: 'insert' | 'update'
): Promise<{ success: boolean; resolvedData?: T; error?: any }> {
  try {
    // For inserts, check if record already exists (duplicate ID)
    if (operation === 'insert') {
      const { data: existing } = await supabase
        .from(table)
        .select('id')
        .eq('id', recordId)
        .single();

      if (existing) {
        console.log(`[Conflict Resolver] Record already exists, converting to update`);
        operation = 'update';
      }
    }

    // Detect conflicts for updates
    if (operation === 'update') {
      const conflict = await detectConflict(table, recordId, localData);

      if (conflict) {
        console.log(`[Conflict Resolver] Conflict detected for ${table}/${recordId}`);
        const resolved = await resolveConflict(conflict);

        // Update server with resolved version
        const { data, error } = await supabase
          .from(table)
          .update(resolved)
          .eq('id', recordId)
          .select()
          .single();

        if (error) throw error;

        // Update local cache
        await put(table, data);

        return { success: true, resolvedData: data as T };
      }
    }

    // No conflict, proceed with normal sync
    const { data, error } = operation === 'insert'
      ? await supabase.from(table).insert(localData).select().single()
      : await supabase.from(table).update(localData).eq('id', recordId).select().single();

    if (error) throw error;

    // Update local cache
    await put(table, data);

    return { success: true, resolvedData: data as T };
  } catch (error) {
    console.error(`[Conflict Resolver] Error resolving conflict:`, error);
    return { success: false, error };
  }
}

// Get conflict statistics
export async function getConflictStats(): Promise<{
  total: number;
  byTable: Record<string, number>;
}> {
  // This would check pending sync queue for potential conflicts
  // For now, return empty stats
  return {
    total: 0,
    byTable: {},
  };
}
