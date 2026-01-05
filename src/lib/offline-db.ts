// IndexedDB wrapper for offline data storage

const DB_NAME = 'fieldtrack_offline';
const DB_VERSION = 1;

export interface OfflineDB extends IDBDatabase {
  // Typed access to object stores
}

// Initialize IndexedDB
export async function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create object stores for each table
      
      // Jobs store
      if (!db.objectStoreNames.contains('jobs')) {
        const jobsStore = db.createObjectStore('jobs', { keyPath: 'id' });
        jobsStore.createIndex('status', 'status', { unique: false });
        jobsStore.createIndex('updated_at', 'updated_at', { unique: false });
      }

      // Components store
      if (!db.objectStoreNames.contains('components')) {
        const componentsStore = db.createObjectStore('components', { keyPath: 'id' });
        componentsStore.createIndex('archived', 'archived', { unique: false });
      }

      // Time entries store
      if (!db.objectStoreNames.contains('time_entries')) {
        const timeEntriesStore = db.createObjectStore('time_entries', { keyPath: 'id' });
        timeEntriesStore.createIndex('job_id', 'job_id', { unique: false });
        timeEntriesStore.createIndex('user_id', 'user_id', { unique: false });
        timeEntriesStore.createIndex('is_active', 'is_active', { unique: false });
      }

      // Daily logs store
      if (!db.objectStoreNames.contains('daily_logs')) {
        const dailyLogsStore = db.createObjectStore('daily_logs', { keyPath: 'id' });
        dailyLogsStore.createIndex('job_id', 'job_id', { unique: false });
        dailyLogsStore.createIndex('log_date', 'log_date', { unique: false });
      }

      // Photos store
      if (!db.objectStoreNames.contains('photos')) {
        const photosStore = db.createObjectStore('photos', { keyPath: 'id' });
        photosStore.createIndex('job_id', 'job_id', { unique: false });
        photosStore.createIndex('photo_date', 'photo_date', { unique: false });
      }

      // User profiles store
      if (!db.objectStoreNames.contains('user_profiles')) {
        db.createObjectStore('user_profiles', { keyPath: 'id' });
      }

      // Workers store
      if (!db.objectStoreNames.contains('workers')) {
        const workersStore = db.createObjectStore('workers', { keyPath: 'id' });
        workersStore.createIndex('active', 'active', { unique: false });
      }

      // Materials store
      if (!db.objectStoreNames.contains('materials')) {
        const materialsStore = db.createObjectStore('materials', { keyPath: 'id' });
        materialsStore.createIndex('job_id', 'job_id', { unique: false });
        materialsStore.createIndex('status', 'status', { unique: false });
      }

      // Sync queue store - tracks operations to sync when online
      if (!db.objectStoreNames.contains('sync_queue')) {
        const syncQueueStore = db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
        syncQueueStore.createIndex('table', 'table', { unique: false });
        syncQueueStore.createIndex('timestamp', 'timestamp', { unique: false });
        // Note: No index on 'synced' because booleans are not valid IndexedDB keys
      }

      console.log('[IndexedDB] Database initialized');
    };
  });
}

// Generic CRUD operations

export async function getAll<T>(storeName: string): Promise<T[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getById<T>(storeName: string, id: string): Promise<T | undefined> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getByIndex<T>(
  storeName: string,
  indexName: string,
  value: any
): Promise<T[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const index = store.index(indexName);
    
    // Handle boolean values and other types properly
    const keyRange = value === null || value === undefined 
      ? undefined 
      : IDBKeyRange.only(value);
    
    const request = keyRange ? index.getAll(keyRange) : index.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function put<T>(storeName: string, data: T): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(data);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function putMany<T>(storeName: string, items: T[]): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);

    items.forEach((item) => store.put(item));

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function remove(storeName: string, id: string): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function clear(storeName: string): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Sync queue operations

export interface SyncQueueItem {
  id?: number;
  table: string;
  operation: 'insert' | 'update' | 'delete';
  data: any;
  recordId: string;
  timestamp: string;
  synced: boolean;
  error?: string;
}

export async function addToSyncQueue(item: Omit<SyncQueueItem, 'id' | 'timestamp' | 'synced'>): Promise<void> {
  const queueItem: SyncQueueItem = {
    ...item,
    timestamp: new Date().toISOString(),
    synced: false,
  };

  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('sync_queue', 'readwrite');
    const store = transaction.objectStore('sync_queue');
    const request = store.add(queueItem);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getPendingSyncItems(): Promise<SyncQueueItem[]> {
  // Can't use index on boolean field, so get all and filter in memory
  const allItems = await getAll<SyncQueueItem>('sync_queue');
  return allItems.filter(item => !item.synced);
}

export async function markSynced(id: number): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('sync_queue', 'readwrite');
    const store = transaction.objectStore('sync_queue');
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const item = getRequest.result;
      if (item) {
        item.synced = true;
        store.put(item);
      }
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function clearSyncedItems(): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('sync_queue', 'readwrite');
    const store = transaction.objectStore('sync_queue');
    const request = store.openCursor();

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        // Only delete if synced is true
        if (cursor.value.synced === true) {
          cursor.delete();
        }
        cursor.continue();
      }
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
