// Banco de dados local (IndexedDB) — tudo fica no aparelho.
export const STORES = ['settings', 'pages', 'routines', 'logs', 'strategies', 'projects', 'ideas', 'habits', 'misc', 'reminders', 'meds'];
const DB_NAME = 'tdah-vida-real';
const DB_VERSION = 2;
export const SCHEMA = 1;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then(r => { out = r; });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

function reqP(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const db = {
  get: (store, id) => tx(store, 'readonly', s => reqP(s.get(id))),
  all: (store) => tx(store, 'readonly', s => reqP(s.getAll())),
  put: (store, obj) => tx(store, 'readwrite', s => reqP(s.put(obj))),
  del: (store, id) => tx(store, 'readwrite', s => reqP(s.delete(id))),
  clear: (store) => tx(store, 'readwrite', s => reqP(s.clear())),
  putMany: (store, list) => tx(store, 'readwrite', s => Promise.all(list.map(o => reqP(s.put(o))))),
};

export async function exportAll() {
  const stores = {};
  for (const s of STORES) stores[s] = await db.all(s);
  return { app: 'tdah-vida-real', schema: SCHEMA, exportedAt: new Date().toISOString(), stores };
}

// mode: 'replace' apaga o que existe nas coleções do arquivo; 'merge' adiciona/atualiza por id.
export async function importAll(data, mode = 'merge') {
  if (!data || data.app !== 'tdah-vida-real' || typeof data.stores !== 'object') {
    throw new Error('Arquivo não reconhecido. Use um backup exportado por este app.');
  }
  let count = 0;
  for (const s of STORES) {
    const list = data.stores[s];
    if (!Array.isArray(list)) continue;
    if (mode === 'replace') await db.clear(s);
    const valid = list.filter(o => o && o.id !== undefined && o.id !== null);
    await db.putMany(s, valid);
    count += valid.length;
  }
  return count;
}

export async function wipeAll() {
  for (const s of STORES) await db.clear(s);
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function todayKey(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
