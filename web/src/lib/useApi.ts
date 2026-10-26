import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

/**
 * Local data loader for a single page. Each page owns its own state — there is
 * no shared/global store for lists or records.
 */
export function useApi<T>(loader: () => Promise<T>, deps: DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    loaderRef
      .current()
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, error, loading, reload };
}
