// Vitest setup. Node 25 ships an experimental global `localStorage` that
// shadows jsdom's and throws without a backing file, so give every test a
// plain in-memory Web Storage instead.

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  const store = new MemoryStorage();
  Object.defineProperty(globalThis, name, { value: store, configurable: true, writable: true });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, name, { value: store, configurable: true, writable: true });
  }
}
