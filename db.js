/* ============================================================
   Aequum — Database Layer (IndexedDB)
   Handles all persistent data storage for clients and sessions
   ============================================================ */

const AequumDB = (() => {
  const DB_NAME = 'aequum_db';
  const DB_VERSION = 1;
  let db = null;

  // ── Initialize Database ──────────────────────────────
  function init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);

      request.onupgradeneeded = (e) => {
        const database = e.target.result;

        // Clients store
        if (!database.objectStoreNames.contains('clients')) {
          const clientStore = database.createObjectStore('clients', { keyPath: 'id' });
          clientStore.createIndex('name', 'name', { unique: false });
          clientStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Sessions store
        if (!database.objectStoreNames.contains('sessions')) {
          const sessionStore = database.createObjectStore('sessions', { keyPath: 'id' });
          sessionStore.createIndex('clientId', 'clientId', { unique: false });
          sessionStore.createIndex('capturedAt', 'capturedAt', { unique: false });
        }

        // Images store (binary blobs stored locally)
        if (!database.objectStoreNames.contains('images')) {
          database.createObjectStore('images', { keyPath: 'id' });
        }
      };

      request.onsuccess = (e) => {
        db = e.target.result;
        resolve(db);
      };
    });
  }

  // ── Generic CRUD helpers ─────────────────────────────
  function _tx(storeName, mode = 'readonly') {
    const tx = db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  function _put(storeName, data) {
    return new Promise((resolve, reject) => {
      const store = _tx(storeName, 'readwrite');
      const req = store.put(data);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function _get(storeName, id) {
    return new Promise((resolve, reject) => {
      const store = _tx(storeName);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function _getAll(storeName) {
    return new Promise((resolve, reject) => {
      const store = _tx(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function _delete(storeName, id) {
    return new Promise((resolve, reject) => {
      const store = _tx(storeName, 'readwrite');
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  function _getAllByIndex(storeName, indexName, value) {
    return new Promise((resolve, reject) => {
      const store = _tx(storeName);
      const index = store.index(indexName);
      const req = index.getAll(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // ── Client Operations ────────────────────────────────
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  async function createClient(data) {
    const client = {
      id: generateId(),
      name: data.name.trim(),
      dateOfBirth: data.dateOfBirth || '',
      gender: data.gender || '',
      heightCm: data.heightCm ? parseFloat(data.heightCm) : null,
      medicalHistory: data.medicalHistory || '',
      chiefComplaint: data.chiefComplaint || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await _put('clients', client);
    return client;
  }

  async function updateClient(id, data) {
    const existing = await _get('clients', id);
    if (!existing) throw new Error('Client not found');
    const updated = {
      ...existing,
      ...data,
      id, // ensure id is preserved
      updatedAt: new Date().toISOString(),
    };
    await _put('clients', updated);
    return updated;
  }

  async function getClient(id) {
    return _get('clients', id);
  }

  async function getAllClients() {
    const clients = await _getAll('clients');
    return clients.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async function deleteClient(id) {
    // Also delete all sessions and images for this client
    const sessions = await getSessionsByClient(id);
    for (const s of sessions) {
      await deleteSession(s.id);
    }
    return _delete('clients', id);
  }

  async function searchClients(query) {
    const all = await getAllClients();
    const q = query.toLowerCase();
    return all.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.chiefComplaint || '').toLowerCase().includes(q)
    );
  }

  // ── Session Operations ───────────────────────────────
  async function createSession(data) {
    const session = {
      id: generateId(),
      clientId: data.clientId,
      capturedAt: new Date().toISOString(),
      imageId: data.imageId || null,
      landmarks: data.landmarks || [],
      deviations: data.deviations || [],
      notes: data.notes || '',
      scaleFactor: data.scaleFactor || null, // px to cm conversion
    };
    await _put('sessions', session);

    // Update client's updatedAt
    const client = await getClient(data.clientId);
    if (client) {
      await _put('clients', { ...client, updatedAt: new Date().toISOString() });
    }

    return session;
  }

  async function updateSession(id, data) {
    const existing = await _get('sessions', id);
    if (!existing) throw new Error('Session not found');
    const updated = { ...existing, ...data, id };
    await _put('sessions', updated);
    return updated;
  }

  async function getSession(id) {
    return _get('sessions', id);
  }

  async function getSessionsByClient(clientId) {
    const sessions = await _getAllByIndex('sessions', 'clientId', clientId);
    return sessions.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  }

  async function deleteSession(id) {
    const session = await _get('sessions', id);
    if (session && session.imageId) {
      await _delete('images', session.imageId);
    }
    return _delete('sessions', id);
  }

  // ── Image Operations (binary blob storage) ───────────
  async function saveImage(blob) {
    const id = generateId();
    const record = { id, blob, createdAt: new Date().toISOString() };
    await _put('images', record);
    return id;
  }

  async function getImage(id) {
    const record = await _get('images', id);
    return record ? record.blob : null;
  }

  async function deleteImage(id) {
    return _delete('images', id);
  }

  // ── Public API ───────────────────────────────────────
  return {
    init,
    // Clients
    createClient,
    updateClient,
    getClient,
    getAllClients,
    deleteClient,
    searchClients,
    // Sessions
    createSession,
    updateSession,
    getSession,
    getSessionsByClient,
    deleteSession,
    // Images
    saveImage,
    getImage,
    deleteImage,
    // Utils
    generateId,
  };
})();
