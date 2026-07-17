import type {
  PendingGenerationSubmission,
  ProductProfileSnapshot
} from '../domain/generationWorkspace';

const DATABASE_NAME = 'artigen-generation-workspace';
const DATABASE_VERSION = 1;
const STORE_NAME = 'workspace';
const PROFILE_KEY = 'product-profile-v1';
const PENDING_KEY = 'pending-generation-v1';

const openDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('INDEXEDDB_UNAVAILABLE'));
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error || new Error('INDEXEDDB_OPEN_FAILED'));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
  });

const withStore = async <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> => {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = run(transaction.objectStore(STORE_NAME));
    let result: T;
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      database.close();
      reject(error instanceof Error ? error : new Error('INDEXEDDB_TRANSACTION_FAILED'));
    };
    request.onerror = () => fail(request.error || new Error('INDEXEDDB_REQUEST_FAILED'));
    request.onsuccess = () => {
      result = request.result;
    };
    transaction.oncomplete = () => {
      if (settled) return;
      settled = true;
      database.close();
      resolve(result);
    };
    transaction.onabort = () => {
      fail(transaction.error || new Error('INDEXEDDB_TRANSACTION_ABORTED'));
    };
    transaction.onerror = () => fail(transaction.error || new Error('INDEXEDDB_TRANSACTION_FAILED'));
  });
};

const read = async <T>(key: string): Promise<T | null> => {
  try {
    return (await withStore<T | undefined>('readonly', (store) => store.get(key))) || null;
  } catch {
    return null;
  }
};

const write = async (key: string, value: unknown): Promise<boolean> => {
  try {
    await withStore<IDBValidKey>('readwrite', (store) => store.put(value, key));
    return true;
  } catch {
    return false;
  }
};

const remove = async (key: string): Promise<void> => {
  try {
    await withStore<undefined>('readwrite', (store) => store.delete(key));
  } catch {
    // Restricted/private browser modes may disable IndexedDB.
  }
};

export const loadProductProfile = () => read<ProductProfileSnapshot>(PROFILE_KEY);
export const saveProductProfile = (profile: ProductProfileSnapshot) => write(PROFILE_KEY, profile);

export const loadPendingGeneration = () => read<PendingGenerationSubmission>(PENDING_KEY);
export const savePendingGeneration = (pending: PendingGenerationSubmission) =>
  write(PENDING_KEY, pending);
export const clearPendingGeneration = () => remove(PENDING_KEY);
