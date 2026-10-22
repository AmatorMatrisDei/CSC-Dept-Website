import { useState } from "react";

// Cloudflare Turnstile: the check that a person, not a program, is using the sign-in, sign-up and
// password-reset forms. Supabase checks the token for sign-in and sign-up; our password-reset
// function checks it itself. Without VITE_TURNSTILE_SITE_KEY (local development and the tests)
// there is no check and no token. See docs/backend-setup.md, 3.3 step 11.

export const TURNSTILE_SITE_KEY: string | null = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || null;

export type Turnstile = {
  render(element: HTMLElement, options: Record<string, unknown>): string;
  remove(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let loading: Promise<Turnstile> | null = null;

// Loads Cloudflare's script once, and only on the pages that use it. public/_headers allows it.
export function loadTurnstile(): Promise<Turnstile> {
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("no turnstile")));
    script.onerror = () => {
      loading = null;
      reject(new Error("The check that you're a person couldn't load. Check your connection and reload the page."));
    };
    document.head.appendChild(script);
  });
  return loading;
}

// A form's Turnstile token. Each token works once: after using it, call `renew()` and give the
// widget `round` as its key, so Cloudflare issues a fresh one.
export function useTurnstileToken() {
  const [token, setToken] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  return {
    token,
    setToken,
    round,
    // True when the form may be sent: there is a token, or the site has no check.
    ready: TURNSTILE_SITE_KEY === null || token !== null,
    renew: () => {
      setToken(null);
      setRound((r) => r + 1);
    },
  };
}
