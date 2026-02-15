// ---------------------------------------------------------------------------
// Generic in-memory TTL cache
//
// Entries are lazily evicted on access *and* periodically swept so the
// process doesn't leak memory on long-running instances.
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache<T = unknown> {
  private store = new Map<string, CacheEntry<T>>();
  private sweepTimer: ReturnType<typeof setInterval> | undefined;

  constructor(private defaultTtlMs: number = 300_000 /* 5 min */) {
    this.sweepTimer = setInterval(() => this.sweep(), 60_000);
    if (this.sweepTimer.unref) this.sweepTimer.unref();
  }

  set(key: string, value: T, ttlMs: number = this.defaultTtlMs): T {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  get size(): number {
    this.sweep();
    return this.store.size;
  }

  sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now >= entry.expiresAt) this.store.delete(key);
    }
  }

  clear(): void {
    this.store.clear();
  }

  destroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }
}
