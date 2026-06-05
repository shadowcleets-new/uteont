"use client";

import { useCallback, useEffect, useState } from "react";

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

/**
 * Persist a small piece of UI state in localStorage.
 *
 * First render returns `initialValue` (server + first client paint). On
 * mount we read the stored value and re-render, so the value is "wrong"
 * for one paint — fine for collapsible chrome where the default state
 * matches the most common case (expanded). For state where flicker is
 * unacceptable, render the consumer behind a `hasHydrated` boolean.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((prev: T) => T)) => void, boolean] {
  const [stored, setStored] = useState<T>(initialValue);
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        setStored(parseStoredValue<T>(raw, initialValue));
      }
    } catch (e) {
      console.warn(`[useLocalStorage] read error for "${key}":`, e);
    } finally {
      setHasHydrated(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStored((prev) => {
        const next =
          typeof value === "function"
            ? (value as (p: T) => T)(prev)
            : value;
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch (e) {
          console.warn(`[useLocalStorage] write error for "${key}":`, e);
        }
        return next;
      });
    },
    [key],
  );

  return [stored, setValue, hasHydrated];
}
