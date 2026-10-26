import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { pageWindow } from '../lib/pagination';
import type { Paged, Pagination } from '../lib/types';

export interface SearchableSelectOption {
  value: string;
  label: string;
  hint?: string;
}

export interface SearchableSelectPageParams {
  q: string;
  page: number;
  pageSize: number;
}

interface SearchableSelectProps<T> {
  value: string;
  onChange: (value: string) => void;
  fetchPage: (params: SearchableSelectPageParams) => Promise<Paged<T>>;
  mapOption: (item: T) => SearchableSelectOption;
  selectedOption?: SearchableSelectOption | null;
  id?: string;
  className?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyListLabel?: string;
  allowEmpty?: boolean;
  emptyOptionLabel?: string;
  disabled?: boolean;
  pageSize?: number;
  required?: boolean;
  ariaLabel?: string;
}

interface DisplayOption extends SearchableSelectOption {
  pinned?: boolean;
  isClear?: boolean;
}

const SEARCH_DEBOUNCE_MS = 250;
const MAX_LIST_HEIGHT = 264;
const MIN_LIST_HEIGHT = 96;
const POPOVER_CHROME_HEIGHT = 130;
const POPOVER_GAP = 6;
const FULL_POPOVER_HEIGHT = 400;

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Không tải được danh sách.';
}

export function SearchableSelect<T>({
  value,
  onChange,
  fetchPage,
  mapOption,
  selectedOption,
  id,
  className,
  placeholder = 'Chọn…',
  searchPlaceholder = 'Tìm kiếm…',
  emptyListLabel = 'Không tìm thấy kết quả phù hợp.',
  allowEmpty = false,
  emptyOptionLabel = 'Tất cả',
  disabled = false,
  pageSize = 20,
  required = false,
  ariaLabel,
}: SearchableSelectProps<T>) {
  const generatedId = useId();
  const baseId = (id ?? generatedId).replace(/[^a-zA-Z0-9_-]/g, '');
  const listId = `${baseId}-listbox`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<SearchableSelectOption[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [cache, setCache] = useState<Record<string, SearchableSelectOption>>({});
  const [dropUp, setDropUp] = useState(false);
  const [listMaxHeight, setListMaxHeight] = useState(MAX_LIST_HEIGHT);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);
  const lastQueryRef = useRef<string | null>(null);
  const fetchPageRef = useRef(fetchPage);
  const mapOptionRef = useRef(mapOption);
  fetchPageRef.current = fetchPage;
  mapOptionRef.current = mapOption;

  const selected = value
    ? selectedOption?.value === value
      ? selectedOption
      : cache[value]
    : undefined;

  const pinned =
    selected && !items.some((item) => item.value === selected.value) ? selected : undefined;

  const displayOptions: DisplayOption[] = [];
  if (allowEmpty) displayOptions.push({ value: '', label: emptyOptionLabel, isClear: true });
  if (pinned) displayOptions.push({ ...pinned, pinned: true });
  displayOptions.push(...items);

  const totalPages = pagination?.totalPages ?? 0;
  const total = pagination?.total ?? 0;
  const showPager = totalPages > 1;
  const pageTokens = showPager ? pageWindow(page, totalPages) : [];
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const triggerLabel =
    value === '' ? (allowEmpty ? emptyOptionLabel : placeholder) : (selected?.label ?? placeholder);

  function resetPanel() {
    setOpen(false);
    setQuery('');
    setDebouncedQuery('');
    setPage(1);
    setActiveIndex(-1);
  }

  function updatePlacement() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom - POPOVER_GAP;
    const spaceAbove = rect.top - POPOVER_GAP;
    const nextDropUp = spaceBelow < FULL_POPOVER_HEIGHT && spaceAbove > spaceBelow;
    const available = nextDropUp ? spaceAbove : spaceBelow;
    const nextListMaxHeight = Math.min(
      MAX_LIST_HEIGHT,
      Math.max(MIN_LIST_HEIGHT, available - POPOVER_CHROME_HEIGHT),
    );
    setDropUp(nextDropUp);
    setListMaxHeight(nextListMaxHeight);
  }

  function openPanel() {
    if (disabled) return;
    if (open) return;
    updatePlacement();
    setOpen(true);
    setQuery('');
    setDebouncedQuery('');
    setPage(1);
    setActiveIndex(-1);
  }

  function chooseOption(option: DisplayOption) {
    if (option.value !== '') {
      setCache((previous) => ({
        ...previous,
        [option.value]: {
          value: option.value,
          label: option.label,
          hint: option.hint,
        },
      }));
    }
    onChange(option.value);
    resetPanel();
    triggerRef.current?.focus();
  }

  function changePage(nextPage: number) {
    if (nextPage < 1 || nextPage > totalPages || nextPage === page) return;
    setPage(nextPage);
    setActiveIndex(-1);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const requestId = ++requestIdRef.current;
    let cancelled = false;
    const queryChanged = lastQueryRef.current !== debouncedQuery;
    lastQueryRef.current = debouncedQuery;

    if (queryChanged) {
      setItems([]);
      setPagination(null);
    }
    setLoading(true);
    setError(null);

    void fetchPageRef
      .current({ q: debouncedQuery, page, pageSize })
      .then((result) => {
        if (cancelled || requestId !== requestIdRef.current) return;
        if (result.pagination.totalPages > 0 && page > result.pagination.totalPages) {
          setPagination(result.pagination);
          setPage(result.pagination.totalPages);
          return;
        }
        const mapped = result.items.map((item) => mapOptionRef.current(item));
        setItems(mapped);
        setPagination(result.pagination);
        if (mapped.length > 0) {
          setCache((previous) => {
            const next = { ...previous };
            for (const option of mapped) next[option.value] = option;
            return next;
          });
        }
      })
      .catch((fetchError: unknown) => {
        if (cancelled || requestId !== requestIdRef.current) return;
        setItems([]);
        setPagination(null);
        setError(errorMessage(fetchError));
      })
      .finally(() => {
        if (cancelled || requestId !== requestIdRef.current) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, debouncedQuery, page, pageSize, reloadKey]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => searchRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [debouncedQuery, open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) resetPanel();
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onViewportChange() {
      updatePlacement();
    }
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, { passive: true });
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange);
    };
  }, [open]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    document.getElementById(`${baseId}-option-${activeIndex}`)?.scrollIntoView({
      block: 'nearest',
    });
  }, [activeIndex, open, baseId]);

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (displayOptions.length === 0) return;
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((current) => {
        if (current < 0) return direction > 0 ? 0 : displayOptions.length - 1;
        return Math.min(Math.max(current + direction, 0), displayOptions.length - 1);
      });
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const activeOption =
        activeIndex >= 0 && activeIndex < displayOptions.length
          ? displayOptions[activeIndex]
          : displayOptions.length === 1
            ? displayOptions[0]
            : undefined;
      if (activeOption) chooseOption(activeOption);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      resetPanel();
      triggerRef.current?.focus();
    }
  }

  return (
    <div
      ref={rootRef}
      className={`searchable-select${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`}
    >
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className="ss-trigger"
        onClick={() => (open ? resetPanel() : openPanel())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            openPanel();
          }
          if (event.key === 'Escape' && open) {
            event.preventDefault();
            resetPanel();
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-required={required || undefined}
        disabled={disabled}
      >
        <span className={`ss-value${value === '' && !allowEmpty ? ' is-placeholder' : ''}`}>
          {triggerLabel}
        </span>
        <span className="ss-chevron" aria-hidden="true" />
      </button>

      {open ? (
        <div className={`ss-popover${dropUp ? ' is-drop-up' : ''}`}>
          <div className="ss-search-wrap">
            <input
              ref={searchRef}
              type="search"
              className="ss-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder={searchPlaceholder}
              autoComplete="off"
              maxLength={100}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={
                activeIndex >= 0 ? `${baseId}-option-${activeIndex}` : undefined
              }
            />
          </div>

          <div
            id={listId}
            className={`ss-list${loading ? ' is-loading' : ''}`}
            style={{ maxHeight: listMaxHeight }}
            role="listbox"
            aria-label={ariaLabel}
          >
            {displayOptions.map((option, index) => {
              const isSelected = option.value === value;
              const isActive = index === activeIndex;
              return (
                <button
                  key={`${option.pinned ? 'pinned-' : ''}${option.value || 'empty'}-${index}`}
                  id={`${baseId}-option-${index}`}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={isSelected}
                  className={`ss-option${isSelected ? ' is-selected' : ''}${
                    isActive ? ' is-active' : ''
                  }${option.pinned ? ' is-pinned' : ''}${option.isClear ? ' is-clear' : ''}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseOption(option)}
                >
                  <span className="ss-option-main">
                    <span className="ss-option-label">{option.label}</span>
                    {option.hint ? <span className="ss-option-hint">{option.hint}</span> : null}
                  </span>
                  <span className="ss-option-meta">
                    {option.pinned ? <span className="ss-pinned-badge">Đang chọn</span> : null}
                    {isSelected ? (
                      <span className="ss-check" aria-hidden="true">
                        ✓
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}

            {!loading && !error && items.length === 0 ? (
              <p className="ss-empty">{emptyListLabel}</p>
            ) : null}
            {loading ? <p className="ss-status">Đang tải danh sách…</p> : null}
            {error ? (
              <div className="ss-error" role="alert">
                <span>{error}</span>
                <button
                  type="button"
                  className="ss-retry"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setReloadKey((key) => key + 1)}
                >
                  Thử lại
                </button>
              </div>
            ) : null}
          </div>

          <div className="ss-footer">
            <span className="ss-range" aria-live="polite">
              {loading && items.length === 0
                ? 'Đang tải…'
                : total === 0
                  ? '0 kết quả'
                  : `${rangeStart}–${rangeEnd} / ${total}`}
            </span>

            {showPager ? (
              <div className="ss-pager" aria-label="Phân trang danh sách">
                <button
                  type="button"
                  className="ss-page ss-page-nav"
                  onClick={() => changePage(page - 1)}
                  onMouseDown={(event) => event.preventDefault()}
                  disabled={loading || page <= 1}
                  aria-label="Trang trước"
                >
                  ‹ Trước
                </button>
                {pageTokens.map((token, index) =>
                  token === 'gap' ? (
                    <span key={`gap-${index}`} className="ss-page-gap" aria-hidden="true">
                      …
                    </span>
                  ) : (
                    <button
                      key={token}
                      type="button"
                      className={`ss-page${token === page ? ' is-current' : ''}`}
                      onClick={() => changePage(token)}
                      onMouseDown={(event) => event.preventDefault()}
                      disabled={loading}
                      aria-label={`Trang ${token}`}
                      aria-current={token === page ? 'page' : undefined}
                    >
                      {token}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  className="ss-page ss-page-nav"
                  onClick={() => changePage(page + 1)}
                  onMouseDown={(event) => event.preventDefault()}
                  disabled={loading || page >= totalPages}
                  aria-label="Trang sau"
                >
                  Sau ›
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
