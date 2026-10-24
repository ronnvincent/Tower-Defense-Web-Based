/**
 * Safe localStorage helpers.
 *
 * localStorage can be unavailable (private mode, disabled cookies), full, or
 * contain data that was edited by hand. Every function here catches errors and
 * falls back to a safe default so the game never crashes because of storage.
 *
 * A `storage` object can be injected (anything with getItem/setItem/removeItem),
 * which lets the unit tests use an in-memory fake instead of the browser.
 */
export function getDefaultStorage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* accessing localStorage can throw in some privacy modes */
  }
  return createMemoryStorage();
}

/** Minimal in-memory Storage implementation (fallback + tests). */
export function createMemoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    clear: () => data.clear(),
  };
}

/**
 * Read and JSON-parse a key.
 * @returns {{status:'ok'|'missing'|'corrupt'|'unavailable', value:any, raw:string|null}}
 */
export function readJSON(storage, key) {
  let raw = null;
  try {
    raw = storage.getItem(key);
  } catch {
    return { status: 'unavailable', value: null, raw: null };
  }
  if (raw === null || raw === undefined) return { status: 'missing', value: null, raw: null };
  try {
    return { status: 'ok', value: JSON.parse(raw), raw };
  } catch {
    return { status: 'corrupt', value: null, raw };
  }
}

/** @returns {boolean} true if the value was stored */
export function writeJSON(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(storage, key) {
  try {
    storage.removeItem(key);
  } catch {
    /* ignore */
  }
}
