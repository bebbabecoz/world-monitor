interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

// Module-level singleton — persists across requests in the same Node.js process
const store = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): T | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.timestamp > entry.ttl) {
    store.delete(key);
    return null;
  }
  return entry.data;
}

/** Returns cached data even if expired (stale). Returns null only if never set. */
export function getStaleCached<T>(key: string): { data: T; ageMs: number } | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  return { data: entry.data, ageMs: Date.now() - entry.timestamp };
}

export function setCached<T>(key: string, data: T, ttlMs = 10 * 60 * 1000): void {
  store.set(key, { data, timestamp: Date.now(), ttl: ttlMs });
}

export function invalidate(key: string): void {
  store.delete(key);
}
