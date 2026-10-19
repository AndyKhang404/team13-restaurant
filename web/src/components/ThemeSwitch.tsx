import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

const STORAGE_KEY = 'theme';

type DocumentWithTransition = Document & {
  startViewTransition?: (callback: () => void) => unknown;
};

function initialDark(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark';
  } catch {
    return false;
  }
}

/** Owns the light/dark state and persists it, mirroring the old SSR toggle. */
export function useTheme() {
  const [dark, setDark] = useState<boolean>(initialDark);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
  }, [dark]);

  function toggle() {
    const next = !dark;
    const apply = () => flushSync(() => setDark(next));
    const doc = document as DocumentWithTransition;
    if (typeof doc.startViewTransition === 'function') doc.startViewTransition(apply);
    else apply();
  }

  return { dark, toggle };
}

/** Hidden checkbox that the `.page` / `.shell` theme selectors key off. */
export function ThemeToggle({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  return (
    <input
      type="checkbox"
      id="theme-toggle"
      className="theme-toggle"
      checked={dark}
      onChange={onToggle}
      aria-label="Bật/tắt chế độ tối"
    />
  );
}

/** Visible switch (a label pointing at the hidden checkbox). */
export function ThemeSwitch() {
  return <label htmlFor="theme-toggle" className="theme-switch" title="Sáng / Tối" />;
}
