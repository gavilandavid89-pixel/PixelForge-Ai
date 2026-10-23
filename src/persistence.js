const DB_NAME = 'pixelforge-ai';
const DB_VERSION = 1;
const STORE = 'documents';

function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new Error('This browser does not support local project storage.'));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open project storage.'));
  });
}
export async function saveProject(project) {
  const db = await openDB();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ id: project.id, name: project.name, updatedAt: Date.now(), project });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error ?? new Error('Save failed.'));
      tx.onabort = () => reject(tx.error ?? new Error('Save was interrupted.'));
    });
  } finally { db.close(); }
}
export async function loadMostRecentProject() {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result.sort((a, b) => b.updatedAt - a.updatedAt)[0]?.project ?? null);
      request.onerror = () => reject(request.error ?? new Error('Could not read saved project.'));
    });
  } finally { db.close(); }
}
