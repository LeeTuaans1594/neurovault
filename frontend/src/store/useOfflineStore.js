import { create } from 'zustand';

/**
 * NEUROVAULT — Offline/PWA Store
 *
 * Manages:
 * - Online/offline connectivity detection
 * - Service Worker update notifications
 * - PWA install prompt (beforeinstallprompt)
 * - Offline action queue
 * - IndexedDB cached documents for offline reading
 */
const useOfflineStore = create((set, get) => ({
  // ── Connectivity ──
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  wasOffline: false, // Track if user was recently offline

  // ── SW Update ──
  updateAvailable: false,
  updateRegistration: null,

  // ── Install Prompt ──
  installPrompt: null,
  isInstalled: false,

  // ── Offline Queue ──
  pendingActions: [], // Actions queued while offline

  // ── Cached Data ──
  cachedDocIds: [], // Document IDs available offline

  // ── Actions ──

  initListeners: () => {
    // Online/offline events
    const handleOnline = () => {
      set({ isOnline: true });
      // Flush pending actions
      get().flushQueue();
    };
    const handleOffline = () => {
      set({ isOnline: false, wasOffline: true });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // PWA install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      set({ installPrompt: e });
    });

    // Detect if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      set({ isInstalled: true });
    }

    // Load cached doc IDs from localStorage
    try {
      const cached = JSON.parse(localStorage.getItem('nv_offline_docs') || '[]');
      set({ cachedDocIds: cached });
    } catch { /* */ }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  },

  setUpdateAvailable: (registration) => {
    set({ updateAvailable: true, updateRegistration: registration });
  },

  applyUpdate: () => {
    const { updateRegistration } = get();
    if (updateRegistration?.waiting) {
      updateRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
    }
  },

  dismissUpdate: () => set({ updateAvailable: false }),

  triggerInstall: async () => {
    const { installPrompt } = get();
    if (!installPrompt) return false;
    installPrompt.prompt();
    const result = await installPrompt.userChoice;
    set({ installPrompt: null });
    if (result.outcome === 'accepted') {
      set({ isInstalled: true });
      return true;
    }
    return false;
  },

  // Queue an action for when back online (must be serializable — no functions!)
  queueAction: (action) => {
    const serializable = {
      type: action.type,
      url: action.url,
      method: action.method || 'POST',
      body: action.body || null,
      queuedAt: Date.now(),
    };
    set(s => ({ pendingActions: [...s.pendingActions, serializable] }));
    try {
      localStorage.setItem('nv_offline_queue', JSON.stringify(get().pendingActions));
    } catch { /* */ }
  },

  flushQueue: async () => {
    const { pendingActions } = get();
    if (pendingActions.length === 0) return;

    const remaining = [];
    for (const action of pendingActions) {
      try {
        if (action.type === 'api_call' && action.url) {
          const headers = { 'Content-Type': 'application/json' };
          const token = localStorage.getItem('nv_access_token');
          if (token) headers['Authorization'] = `Bearer ${token}`;
          await fetch(action.url, {
            method: action.method || 'POST',
            headers,
            body: action.body ? JSON.stringify(action.body) : undefined,
          });
        }
      } catch {
        remaining.push(action); // Re-queue failed actions
      }
    }
    set({ pendingActions: remaining });
    localStorage.setItem('nv_offline_queue', JSON.stringify(remaining));
  },

  // Cache a document for offline reading
  cacheDocument: async (docId, data) => {
    try {
      const db = await openDB();
      const tx = db.transaction('documents', 'readwrite');
      tx.objectStore('documents').put({ id: docId, data, cachedAt: Date.now() });
      await txComplete(tx);

      const ids = [...new Set([...get().cachedDocIds, docId])];
      set({ cachedDocIds: ids });
      localStorage.setItem('nv_offline_docs', JSON.stringify(ids));
    } catch (err) {
      console.warn('[Offline] Failed to cache document:', err.message);
    }
  },

  getCachedDocument: async (docId) => {
    try {
      const db = await openDB();
      const tx = db.transaction('documents', 'readonly');
      const result = await txGet(tx.objectStore('documents'), docId);
      return result?.data || null;
    } catch {
      return null;
    }
  },

  removeCachedDocument: async (docId) => {
    try {
      const db = await openDB();
      const tx = db.transaction('documents', 'readwrite');
      tx.objectStore('documents').delete(docId);
      await txComplete(tx);

      const ids = get().cachedDocIds.filter(id => id !== docId);
      set({ cachedDocIds: ids });
      localStorage.setItem('nv_offline_docs', JSON.stringify(ids));
    } catch { /* */ }
  },
}));

// ── IndexedDB helpers ──

const DB_NAME = 'neurovault-offline';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('documents')) {
        db.createObjectStore('documents', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txComplete(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function txGet(store, key) {
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export default useOfflineStore;
