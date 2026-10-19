import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

interface ThemeContextType {
  isDark: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDark, setIsDark] = useState<boolean>(() => {
    return localStorage.getItem('theme') === 'dark';
  });

  useEffect(() => {
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    const input = document.getElementById('theme-toggle') as HTMLInputElement | null;
    if (input) {
      input.checked = isDark;
    }
  }, [isDark]);

  const toggleTheme = useCallback(() => {
    const apply = () => {
      setIsDark((prev) => !prev);
    };

    if (typeof document !== 'undefined' && 'startViewTransition' in document) {
      ((document as unknown) as { startViewTransition: (cb: () => void) => void }).startViewTransition(apply);
    } else {
      apply();
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      <input
        type="checkbox"
        id="theme-toggle"
        className="theme-toggle"
        checked={isDark}
        onChange={toggleTheme}
        aria-label="Bật/tắt chế độ tối"
      />
      {children}
    </ThemeContext.Provider>
  );
};

export function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
