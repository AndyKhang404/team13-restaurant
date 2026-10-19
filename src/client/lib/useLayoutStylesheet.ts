import { useEffect } from 'react';

/**
 * Dynamically switches layout stylesheet to prevent style pollution between public and admin designs.
 */
export function useLayoutStylesheet(cssPaths: string[]) {
  useEffect(() => {
    const createdLinks: HTMLLinkElement[] = [];

    // Remove any previously injected layout links that aren't in cssPaths
    const existing = document.querySelectorAll<HTMLLinkElement>('link[data-layout-css]');
    existing.forEach((link) => {
      if (!cssPaths.includes(link.getAttribute('href') || '')) {
        link.remove();
      }
    });

    cssPaths.forEach((path) => {
      const already = document.querySelector<HTMLLinkElement>(`link[href="${path}"]`);
      if (!already) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = path;
        link.setAttribute('data-layout-css', 'true');
        document.head.appendChild(link);
        createdLinks.push(link);
      }
    });
  }, [cssPaths.join(',')]);
}
