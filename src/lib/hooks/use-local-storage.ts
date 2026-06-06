"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * SSR-safe parser. JSON.parse with a fallback when the stored value is
 * corrupted or pre-dates a schema change. Pure — extracted so it can be
 * unit-tested without a DOM.
 */
export function parseStoredValue<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// Same-tab cross-component sync: the native `storage` event only fires in
// OTHER tabs, so setValue dispatches this custom event for siblings here.
const SYNC_EVENT = "uteont:local-storage";

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  window.addEventListener(SYNC_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(SYNC_EVENT, callback);
  };
}

/**
 * Persist a small piece of UI state in localStorage.
 *
 * Backed by `useSyncExternalStore` so the value is read directly from the
 * external store (localStorage) without a sync-setState-in-effect. The
 * server snapshot is always `null` → `initialValue`, matching the first
 * client paint, so there's no hydration mismatch and no CLS; React
 * re-renders with the stored value after hydration.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const getSnapshot = (): string | null => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const raw = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const value = parseStoredValue<T>(raw, initialValue);

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      try {
        const current = parseStoredValue<T>(
          window.localStorage.getItem(key),
          initialValue,
        );
        const resolved =
          typeof next === "function"
            ? (next as (prev: T) => T)(current)
            : next;
        window.localStorage.setItem(key, JSON.stringify(resolved));
        window.dispatchEvent(new Event(SYNC_EVENT));
      } catch (e) {
        console.warn(`[useLocalStorage] write error for "${key}":`, e);
      }
    },
    [key, initialValue],
  );

  return [value, setValue];
}
