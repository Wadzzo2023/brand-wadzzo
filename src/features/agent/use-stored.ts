"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

const subscribeNever = () => () => undefined;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * A per-viewer remembered string (open/closed, last conversation…). Reads
 * localStorage once it's available (null on the server and when storage is
 * blocked), and survives storage failures — it just isn't remembered then.
 */
export function useStored(key: string): [string | null, (value: string | null) => void] {
  const saved = useSyncExternalStore(subscribeNever, () => read(key), () => null);
  // A change made in this session, for this key (a new key starts from what's saved).
  const [override, setOverride] = useState<{ key: string; value: string | null } | null>(null);
  const value = override?.key === key ? override.value : saved;

  const set = useCallback(
    (next: string | null) => {
      setOverride({ key, value: next });
      try {
        if (next === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, next);
      } catch {
        // private mode / blocked storage
      }
    },
    [key],
  );
  return [value, set];
}
