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
      const updatedAt = globalThis.performance?.timeOrigin ? globalThis.performance.timeOrigin + globalThis.performance.now() : Date.now();
      tx.objectStore(STORE).put({ id: project.id, name: project.name, updatedAt, project });
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

export async function listSavedProjects() {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result.map(record => ({
        id: record.id, name: record.name, width: record.project.width,
        height: record.project.height, updatedAt: record.updatedAt
      })).sort((a, b) => b.updatedAt - a.updatedAt));
      request.onerror = () => reject(request.error ?? new Error('Could not list saved projects.'));
    });
  } finally { db.close(); }
}
export async function loadProjectById(id) {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(id);
      request.onsuccess = () => resolve(request.result?.project ?? null);
      request.onerror = () => reject(request.error ?? new Error('Could not open the selected project.'));
    });
  } finally { db.close(); }
}
