import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { PagingMode } from './types';
import { MAX_PAGE_SIZE, PAGE_SIZE } from './pagination';

const MODES: PagingMode[] = ['infinite', 'loadMore', 'pages'];

function parsePage(raw: string | null): number {
  const n = Number.parseInt(raw ?? '1', 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function parsePageSize(raw: string | null): number {
  const n = Number.parseInt(raw ?? String(PAGE_SIZE), 10);
  return Number.isFinite(n) && n >= 1 && n <= MAX_PAGE_SIZE ? n : PAGE_SIZE;
}

function parseMode(raw: string | null, fallback: PagingMode): PagingMode {
  return MODES.includes(raw as PagingMode) ? (raw as PagingMode) : fallback;
}

export interface NavigateOptions {
  replace?: boolean;
}

/** URL-backed list state shared by the public menu and every admin list. */
export function useListParams(defaultMode: PagingMode) {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const category = searchParams.get('category') ?? '';
  const sort = searchParams.get('sort') ?? '';
  const page = parsePage(searchParams.get('page'));
  const pageSize = parsePageSize(searchParams.get('pageSize'));
  const mode = parseMode(searchParams.get('mode'), defaultMode);

  const update = useCallback(
    (mutate: (next: URLSearchParams) => void, options?: NavigateOptions) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          mutate(next);
          return next;
        },
        { replace: options?.replace },
      );
    },
    [setSearchParams],
  );

  const setFilter = useCallback(
    (key: string, value: string) => {
      update((next) => {
        const term = value.trim();
        if (term) next.set(key, term);
        else next.delete(key);
        next.delete('page');
      });
    },
    [update],
  );

  const setPage = useCallback(
    (nextPage: number, options?: NavigateOptions) => {
      update((next) => {
        if (nextPage <= 1) next.delete('page');
        else next.set('page', String(nextPage));
      }, options);
    },
    [update],
  );

  const setMode = useCallback(
    (nextMode: PagingMode) => {
      update((next) => {
        if (nextMode === defaultMode) next.delete('mode');
        else next.set('mode', nextMode);
      }, { replace: true });
    },
    [defaultMode, update],
  );

  const setPageSize = useCallback(
    (nextPageSize: number) => {
      update((next) => {
        if (nextPageSize === PAGE_SIZE) next.delete('pageSize');
        else next.set('pageSize', String(nextPageSize));
        next.delete('page');
      });
    },
    [update],
  );

  const clearFilters = useCallback(
    (keys: string[] = ['q', 'category', 'sort']) => {
      update((next) => {
        for (const key of keys) next.delete(key);
        next.delete('page');
      });
    },
    [update],
  );

  const buildFilterUrl = useCallback(
    (patch: Record<string, string>) => {
      const next = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(patch)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      next.delete('page');
      const qs = next.toString();
      return qs ? `?${qs}` : '';
    },
    [searchParams],
  );

  return {
    q,
    category,
    sort,
    page,
    pageSize,
    mode,
    setFilter,
    setPage,
    setPageSize,
    setMode,
    clearFilters,
    buildFilterUrl,
  };
}
