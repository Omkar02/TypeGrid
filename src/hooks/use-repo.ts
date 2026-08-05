"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { STORE_EVENT, ensureSeeded } from "@/lib/repo";

let seedPromise: Promise<void> | null = null;

function seedOnce(): Promise<void> {
  seedPromise ??= ensureSeeded();
  return seedPromise;
}

export interface RepoQuery<T> {
  /** `undefined` until the first fetch settles. */
  data: T | undefined;
  /** True until the first fetch settles; refetches do not flip it back. */
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Runs `fn` against the repository on mount, whenever `deps` change, and
 * whenever anything writes to the store. Keeps every open panel in sync
 * without pulling in a client cache library.
 *
 * Callers should branch on `data === undefined` rather than `loading` — that
 * way a background refetch never flashes a spinner over live content.
 */
export function useRepoQuery<T>(
  fn: () => Promise<T>,
  deps: React.DependencyList,
): RepoQuery<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);

  // Declared before the fetch effect so `fnRef` is fresh by the time it runs.
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    seedOnce()
      .then(() => fnRef.current())
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  useEffect(() => {
    const onChange = () => refetch();
    window.addEventListener(STORE_EVENT, onChange);
    return () => window.removeEventListener(STORE_EVENT, onChange);
  }, [refetch]);

  return { data, loading, error, refetch };
}
