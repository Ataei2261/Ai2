
import { FestivalInfo } from '../types';

const DB_NAME = 'FestivalAppDB';
const DB_VERSION = 1;
const STORE_NAME = 'festivals';
const MIGRATION_KEY_LOCALSTORAGE_TO_IDB = 'migration_v1_festivals_ls_to_idb_done';

let db: IDBDatabase | null = null;

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const tempDb = (event.target as IDBOpenDBRequest).result;
      if (!tempDb.objectStoreNames.contains(STORE_NAME)) {
        tempDb.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      // console.log('[DB] Upgrade needed and object store ensured.');
    };

    request.onsuccess = (event) => {
      db = (event.target as IDBOpenDBRequest).result;
      // console.log('[DB] Database opened successfully.');
      resolve(db);
    };

    request.onerror = (event) => {
      console.error('[DB] Error opening database:', (event.target as IDBOpenDBRequest).error);
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
};

export const initDB = async (): Promise<void> => {
  try {
    await openDB();
    // console.log('[DB] Database initialized.');
  } catch (error) {
    console.error('[DB] Failed to initialize database:', error);
    throw new Error(`Failed to initialize database: ${error instanceof Error ? error.message : String(error)}`);
  }
};

export const getAllFestivals = async (): Promise<FestivalInfo[]> => {
  const currentDb = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = currentDb.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result as FestivalInfo[]);
    };
    request.onerror = (event) => {
      console.error('[DB] Error getting all festivals:', (event.target as IDBRequest).error);
      reject((event.target as IDBRequest).error);
    };
  });
};

export const addFestival = async (festival: FestivalInfo): Promise<void> => {
  const currentDb = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = currentDb.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(festival);

    request.onsuccess = () => {
      resolve();
    };
    request.onerror = (event) => {
      console.error('[DB] Error adding festival:', (event.target as IDBRequest).error);
      reject((event.target as IDBRequest).error);
    };
  });
};

export const updateFestival = async (festival: FestivalInfo): Promise<void> => {
  const currentDb = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = currentDb.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(festival);

    request.onsuccess = () => {
      resolve();
    };
    request.onerror = (event) => {
      console.error('[DB] Error updating festival:', (event.target as IDBRequest).error);
      reject((event.target as IDBRequest).error);
    };
  });
};

export const deleteFestival = async (id: string): Promise<void> => {
  const currentDb = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = currentDb.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      resolve();
    };
    request.onerror = (event) => {
      console.error('[DB] Error deleting festival:', (event.target as IDBRequest).error);
      reject((event.target as IDBRequest).error);
    };
  });
};

export const clearFestivals = async (): Promise<void> => {
  const currentDb = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = currentDb.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => {
      resolve();
    };
    request.onerror = (event) => {
      console.error('[DB] Error clearing festivals:', (event.target as IDBRequest).error);
      reject((event.target as IDBRequest).error);
    };
  });
};

export const bulkAddFestivals = async (festivals: FestivalInfo[]): Promise<void> => {
  if (festivals.length === 0) return Promise.resolve();
  const currentDb = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = currentDb.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    let errorOccurred = false;

    festivals.forEach(festival => {
      if (errorOccurred) return;
      const request = store.add(festival);
      request.onerror = (event) => {
        if (!errorOccurred) {
          errorOccurred = true;
          console.error('[DB] Error bulk adding festival:', (event.target as IDBRequest).error, festival);
          transaction.abort();
          reject((event.target as IDBRequest).error);
        }
      };
    });

    transaction.oncomplete = () => {
      if (!errorOccurred) {
        resolve();
      }
    };
    transaction.onerror = (event) => { // General transaction error
        if (!errorOccurred) { // Ensure reject is called only once
           console.error('[DB] Transaction error during bulk add:', (event.target as IDBTransaction).error);
           reject((event.target as IDBTransaction).error);
        }
    };
     transaction.onabort = () => {
        if (!errorOccurred) { // Check if an error has already been handled
             console.warn('[DB] Transaction aborted during bulk add, possibly due to an earlier error or explicit abort.');
             reject(new Error("Bulk add transaction aborted.")); // Corrected: reject() is a function call
        }
    };
  });
};

// Migration related functions
export const isMigrationDone = (): boolean => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(MIGRATION_KEY_LOCALSTORAGE_TO_IDB) === 'true';
  }
  return true; // Assume done if not in browser (e.g., SSR, though not applicable here)
};

export const markMigrationAsDone = (): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(MIGRATION_KEY_LOCALSTORAGE_TO_IDB, 'true');
  }
};
