import { get, set, del } from 'idb-keyval';

/**
 * Migrates data from localStorage to IndexedDB on the first run.
 * We leave tiny preferences (theme, language) in localStorage for synchronous access,
 * but move large data (questions, papers, attempts) to IDB.
 */
export async function migrateLocalStorageToIDB() {
  const migratedKey = 'm_migrated_to_idb_v1';
  if (localStorage.getItem(migratedKey)) return;

  console.log('Migrating localStorage data to IndexedDB...');
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    // Only migrate app-specific large data
    if (key && (
      key.startsWith('m_study_') || 
      ['m_subjects', 'm_papers', 'm_questions', 'm_attempts', 'm_about_us'].includes(key)
    )) {
      try {
        const value = localStorage.getItem(key);
        if (value) {
          await set(key, value);
        }
      } catch (err) {
        console.warn(`Failed to migrate ${key} to IDB`, err);
      }
    }
  }
  
  localStorage.setItem(migratedKey, 'true');
  console.log('Migration complete.');
}

/**
 * Gets a string value from IDB, mimicking localStorage.getItem
 */
export const idbGet = async (key: string): Promise<string | null> => {
  try {
    const val = await get<string>(key);
    return val ?? null;
  } catch (err) {
    console.warn(`Failed to get ${key} from IDB`, err);
    return null;
  }
};

/**
 * Sets a string value in IDB, mimicking localStorage.setItem
 */
export const idbSet = async (key: string, value: string): Promise<void> => {
  try {
    await set(key, value);
  } catch (err) {
    console.warn(`Failed to set ${key} in IDB`, err);
  }
};

/**
 * Removes a value from IDB, mimicking localStorage.removeItem
 */
export const idbRemove = async (key: string): Promise<void> => {
  try {
    await del(key);
  } catch (err) {
    console.warn(`Failed to delete ${key} from IDB`, err);
  }
};
