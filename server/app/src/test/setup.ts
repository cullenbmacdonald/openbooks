import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Under vitest 0.34 + Node 25, jsdom's window.localStorage getter loses its
// Storage prototype when copied onto the test global (it resolves to
// `Object [Storage] {}` with no methods). Replace it with a small in-memory
// polyfill so code under test (Mantine's useLocalStorage, app state
// persistence) can read/write normally.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

if (typeof window.localStorage.getItem !== "function") {
  Object.defineProperty(window, "localStorage", {
    value: new MemoryStorage(),
    configurable: true
  });
}

// jsdom doesn't implement matchMedia, ResizeObserver, or IntersectionObserver,
// all of which Mantine 5 (MediaQuery, useElementSize) and @tanstack/react-virtual
// rely on. Polyfill minimal stubs so render-smoke tests don't throw.

if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }));
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!window.ResizeObserver) {
  window.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}

class IntersectionObserverStub {
  root = null;
  rootMargin = "";
  thresholds: ReadonlyArray<number> = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

if (!window.IntersectionObserver) {
  window.IntersectionObserver =
    IntersectionObserverStub as unknown as typeof IntersectionObserver;
}

// jsdom never performs layout, so offsetWidth/offsetHeight are always 0.
// @tanstack/react-virtual (stable 3.x) only renders virtual items once its
// scroll element reports a non-zero measured size, so virtualized tables
// would render empty in tests without this. Give every element a
// reasonable non-zero size.
Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
  configurable: true,
  value: 1000
});
Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
  configurable: true,
  value: 1000
});
