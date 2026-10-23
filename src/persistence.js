const DB_NAME = 'pixelforge-ai';
const DB_VERSION = 1;
const STORE = 'documents';
function timestampNow() { return globalThis.performance?.timeOrigin ? globalThis.performance.timeOrigin + globalThis.performance.now() : Date.now(); }

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
      const updatedAt = timestampNow();
      tx.objectStore(STORE).put({ id: project.id, name: project.name, updatedAt, lastOpenedAt: updatedAt, project });
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
      request.onsuccess = () => resolve(request.result.sort((a, b) => (b.lastOpenedAt ?? b.updatedAt) - (a.lastOpenedAt ?? a.updatedAt))[0]?.project ?? null);
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
        height: record.project.height, updatedAt: record.updatedAt, lastOpenedAt: record.lastOpenedAt ?? record.updatedAt
      })).sort((a, b) => b.lastOpenedAt - a.lastOpenedAt));
      request.onerror = () => reject(request.error ?? new Error('Could not list saved projects.'));
    });
  } finally { db.close(); }
}
export async function loadProjectById(id) {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      let project = null;
      const request = store.get(id);
      request.onsuccess = () => {
        const record = request.result;
        if (record) {
          project = record.project;
          record.lastOpenedAt = timestampNow();
          store.put(record);
        }
      };
      request.onerror = () => reject(request.error ?? new Error('Could not open the selected project.'));
      tx.oncomplete = () => resolve(project);
      tx.onerror = () => reject(tx.error ?? new Error('Could not update project recency.'));
      tx.onabort = () => reject(tx.error ?? new Error('Opening the project was interrupted.'));
    });
  } finally { db.close(); }
}
