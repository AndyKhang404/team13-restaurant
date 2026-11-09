import { useEffect, useRef } from 'react';

interface Grecaptcha {
  ready(callback: () => void): void;
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: () => void;
    },
  ): number;
  reset(widgetId?: number): void;
}

declare global {
  interface Window {
    grecaptcha?: Grecaptcha;
  }
}

const SCRIPT_ID = 'google-recaptcha-v2';
const SCRIPT_SRC = 'https://www.google.com/recaptcha/api.js?render=explicit';

let loader: Promise<void> | null = null;

function loadRecaptcha(): Promise<void> {
  if (window.grecaptcha) return Promise.resolve();
  if (loader) return loader;

  loader = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('reCAPTCHA failed to load')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('reCAPTCHA failed to load'));
    document.head.appendChild(script);
  });

  return loader;
}

interface RecaptchaProps {
  siteKey: string;
  onToken: (token: string) => void;
  resetSignal?: number;
}

export default function Recaptcha({ siteKey, onToken, resetSignal = 0 }: RecaptchaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<number | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    let cancelled = false;

    loadRecaptcha()
      .then(() => {
        if (cancelled || !containerRef.current || !window.grecaptcha) return;
        window.grecaptcha.ready(() => {
          if (
            cancelled ||
            !containerRef.current ||
            !window.grecaptcha ||
            widgetRef.current !== null
          ) {
            return;
          }
          widgetRef.current = window.grecaptcha.render(containerRef.current, {
            sitekey: siteKey,
            callback: (token) => onTokenRef.current(token),
            'expired-callback': () => onTokenRef.current(''),
            'error-callback': () => onTokenRef.current(''),
          });
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [siteKey]);

  useEffect(() => {
    if (widgetRef.current !== null) window.grecaptcha?.reset(widgetRef.current);
  }, [resetSignal]);

  return <div className="recaptcha" ref={containerRef} />;
}
