import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Paged, Pagination, PagingMode } from './types';

interface UsePagedListOptions<T> {
  loadPage: (page: number) => Promise<Paged<T>>;
  page: number;
  mode: PagingMode;
  filtersKey: string;
  onPageChange: (page: number, options?: { replace?: boolean }) => void;
}

interface UsePagedListResult<T> {
  items: T[];
  pagination: Pagination | null;
  loading: boolean;
  loadingMore: boolean;
  error: Error | null;
  moreError: Error | null;
  hasNext: boolean;
  outOfRange: boolean;
  loadNext: () => void;
  reload: () => void;
}

type PageCache<T> = Map<number, Paged<T>>;

function pageRange(page: number): number[] {
  return Array.from({ length: page }, (_, index) => index + 1);
}

function itemsFromCache<T>(cache: PageCache<T>, page: number, mode: PagingMode): T[] {
  if (mode === 'pages') return cache.get(page)?.items ?? [];
  const items: T[] = [];
  for (let index = 1; index <= page; index++) {
    const entry = cache.get(index);
    if (!entry) break;
    items.push(...entry.items);
  }
  return items;
}

function loadedThrough<T>(cache: PageCache<T>): number {
  let page = 0;
  while (cache.has(page + 1)) page += 1;
  return page;
}

function firstPagination<T>(cache: PageCache<T>): Pagination | null {
  for (const entry of cache.values()) return entry.pagination;
  return null;
}

/**
 * Server-side list paging with a per-page cache. The cache lets the UI switch
 * between page numbers, "load more" and infinite scroll without refetching
 * pages it already has, so the equivalent page/position is preserved.
 */
export function usePagedList<T>({
  loadPage,
  page,
  mode,
  filtersKey,
  onPageChange,
}: UsePagedListOptions<T>): UsePagedListResult<T> {
  const [cache, setCache] = useState<PageCache<T>>(() => new Map());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [moreError, setMoreError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);

  const cacheRef = useRef<PageCache<T>>(new Map());
  const loadRef = useRef(loadPage);
  const onPageChangeRef = useRef(onPageChange);
  const filtersRef = useRef(filtersKey);
  const requestRef = useRef(0);
  const loadingNextRef = useRef(false);

  loadRef.current = loadPage;
  onPageChangeRef.current = onPageChange;

  const replaceCache = useCallback((next: PageCache<T>) => {
    cacheRef.current = next;
    setCache(next);
  }, []);

  useEffect(() => {
    const filtersChanged = filtersRef.current !== filtersKey;
    filtersRef.current = filtersKey;
    const session = ++requestRef.current;

    const base = filtersChanged ? new Map<number, Paged<T>>() : cacheRef.current;
    if (filtersChanged) {
      replaceCache(base);
      setError(null);
      setMoreError(null);
    }

    const cachedPage = base.get(page);
    const cachedPagination =
      mode === 'pages'
        ? cachedPage?.pagination ?? base.get(loadedThrough(base))?.pagination ?? null
        : base.get(1)?.pagination ?? cachedPage?.pagination ?? firstPagination(base);
    const knownTotalPages = cachedPagination?.totalPages;
    const targets =
      mode === 'pages'
        ? [page]
        : knownTotalPages !== undefined && page > knownTotalPages
          ? [page]
          : pageRange(page);
    const missing = targets.filter((candidate) => !base.has(candidate));

    if (!filtersChanged && missing.length === 0) {
      setError(null);
      setMoreError(null);
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    const hasSome =
      mode === 'pages'
        ? base.has(page)
        : page > 1
          ? base.has(1) || base.has(page)
          : base.has(page);
    setLoading(!hasSome);
    setLoadingMore(hasSome);
    setError(null);
    setMoreError(null);

    void (async () => {
      const next = new Map(base);
      let latestPagination: Pagination | null = null;
      let firstError: Error | null = null;

      async function fetchPages(pages: number[]): Promise<{
        latest: Pagination | null;
        error: Error | null;
        stale: boolean;
      }> {
        if (pages.length === 0) return { latest: null, error: null, stale: false };
        const settled = await Promise.allSettled(
          pages.map(async (candidate) => ({ page: candidate, data: await loadRef.current(candidate) })),
        );
        if (session !== requestRef.current) return { latest: null, error: null, stale: true };

        let latest: Pagination | null = null;
        let error: Error | null = null;
        for (const result of settled) {
          if (result.status === 'fulfilled') {
            const { page: requested, data } = result.value;
            next.set(requested, data);
            if (data.pagination.page !== requested) next.set(data.pagination.page, data);
            latest = data.pagination;
          } else {
            const reason = result.reason;
            if (!error) error = reason instanceof Error ? reason : new Error(String(reason));
          }
        }
        return { latest, error, stale: false };
      }

      if (mode !== 'pages' && knownTotalPages === undefined) {
        const first = await fetchPages([page]);
        if (first.stale) return;
        if (first.latest) latestPagination = first.latest;
        if (first.error) firstError = first.error;

        if (!firstError) {
          const discoveredTotalPages = latestPagination?.totalPages;
          if (discoveredTotalPages === undefined || page <= discoveredTotalPages) {
            const rest = await fetchPages(pageRange(page).filter((candidate) => !next.has(candidate)));
            if (rest.stale) return;
            if (rest.latest) latestPagination = rest.latest;
            if (!firstError && rest.error) firstError = rest.error;
          }
        }
      } else {
        const result = await fetchPages(missing);
        if (result.stale) return;
        if (result.latest) latestPagination = result.latest;
        if (result.error) firstError = result.error;
      }

      replaceCache(next);
      if (firstError) {
        if (hasSome) setMoreError(firstError);
        else setError(firstError);
      }
      if (latestPagination && latestPagination.page !== page) {
        onPageChangeRef.current(latestPagination.page, { replace: true });
      }
      setLoading(false);
      setLoadingMore(false);
    })();
  }, [filtersKey, mode, page, nonce, replaceCache]);

  useEffect(
    () => () => {
      requestRef.current += 1;
    },
    [],
  );

  const loaded = useMemo(() => loadedThrough(cache), [cache]);
  const pagination = useMemo(() => {
    if (mode === 'pages') {
      return cache.get(page)?.pagination ?? cache.get(loaded)?.pagination ?? null;
    }
    return cache.get(loaded)?.pagination ?? cache.get(page)?.pagination ?? null;
  }, [cache, loaded, mode, page]);
  const outOfRange = Boolean(pagination && pagination.total > 0 && page > pagination.totalPages);
  const items = useMemo(
    () => (outOfRange ? [] : itemsFromCache(cache, page, mode)),
    [cache, mode, outOfRange, page],
  );

  const totalPages = pagination?.totalPages ?? 1;
  const hasNext = page < totalPages;

  const loadNext = useCallback(() => {
    if (loadingNextRef.current || page >= totalPages) return;
    const next = page + 1;
    const cached = cacheRef.current.get(next);
    if (cached) {
      onPageChangeRef.current(next, { replace: true });
      return;
    }

    loadingNextRef.current = true;
    setLoadingMore(true);
    setMoreError(null);
    const session = requestRef.current;

    void (async () => {
      try {
        const data = await loadRef.current(next);
        if (session !== requestRef.current) return;
        const updated = new Map(cacheRef.current);
        updated.set(next, data);
        if (data.pagination.page !== next) updated.set(data.pagination.page, data);
        replaceCache(updated);
        onPageChangeRef.current(next, { replace: true });
      } catch (reason) {
        if (session !== requestRef.current) return;
        setMoreError(reason instanceof Error ? reason : new Error(String(reason)));
      } finally {
        if (session === requestRef.current) setLoadingMore(false);
        loadingNextRef.current = false;
      }
    })();
  }, [page, replaceCache, totalPages]);

  const reload = useCallback(() => {
    replaceCache(new Map());
    setLoading(true);
    setError(null);
    setMoreError(null);
    setNonce((value) => value + 1);
  }, [replaceCache]);

  return {
    items,
    pagination,
    loading,
    loadingMore,
    error,
    moreError,
    hasNext,
    outOfRange,
    loadNext,
    reload,
  };
}
