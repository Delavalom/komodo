import { useSyncExternalStore } from "react";

export type Async<T> =
  | { status: "loading" }
  | { status: "ok"; data: T }
  | { status: "error"; error: string };

const LOADING: Async<never> = { status: "loading" };

/**
 * An external store wrapping a one-shot async load.
 *
 * The fetch is kicked off by the first `subscribe` — i.e. on mount, via
 * useSyncExternalStore — so components read async data without useEffect.
 */
class Resource<T> {
  private state: Async<T> = LOADING;
  private listeners = new Set<() => void>();
  private started = false;

  constructor(private readonly loader: () => Promise<T>) {}

  subscribe = (onChange: () => void): (() => void) => {
    this.listeners.add(onChange);
    if (!this.started) {
      this.started = true;
      this.loader().then(
        (data) => this.set({ status: "ok", data }),
        (e: unknown) => this.set({ status: "error", error: e instanceof Error ? e.message : String(e) }),
      );
    }
    return () => {
      this.listeners.delete(onChange);
    };
  };

  getSnapshot = (): Async<T> => this.state;

  private set(next: Async<T>) {
    this.state = next;
    for (const l of this.listeners) l();
  }
}

const cache = new Map<string, Resource<unknown>>();

/** Load (and memoise) an async value by key. Re-renders reuse the same request. */
export function useResource<T>(key: string, loader: () => Promise<T>): Async<T> {
  let resource = cache.get(key) as Resource<T> | undefined;
  if (!resource) {
    resource = new Resource(loader);
    cache.set(key, resource as Resource<unknown>);
  }
  return useSyncExternalStore(resource.subscribe, resource.getSnapshot, resource.getSnapshot);
}

/* ------------------------------------------------------------------ */
/* Hash routing                                                        */
/* ------------------------------------------------------------------ */

function subscribeHash(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function hashSnapshot(): string {
  return window.location.hash || "#/";
}

/** Current location hash, kept in sync without an effect. */
export function useHash(): string {
  return useSyncExternalStore(subscribeHash, hashSnapshot, () => "#/");
}
