import { useSyncExternalStore } from "react";

// Switches between light and dark. Until the visitor clicks it, the site follows the system
// setting. The choice is stored on <html data-theme> and in localStorage (index.html restores it).
const listeners = new Set<() => void>();
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

function subscribe(fn: () => void) {
  listeners.add(fn);
  systemDark.addEventListener("change", fn);
  return () => {
    listeners.delete(fn);
    systemDark.removeEventListener("change", fn);
  };
}

function current() {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === "light" || chosen === "dark") return chosen;
  return systemDark.matches ? "dark" : "light";
}

function choose(theme: "light" | "dark") {
  document.documentElement.dataset.theme = theme;
  listeners.forEach((fn) => fn());
  try {
    localStorage.setItem("theme", theme);
  } catch {
    // Storage can be blocked; the choice then lasts only for this visit.
  }
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, current, () => "light");
  const next = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => choose(next)}
      className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded px-3 text-sm hover:bg-current/10"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        {theme === "dark" ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
        )}
      </svg>
      <span>{next === "dark" ? "Dark" : "Light"}</span>
      <span className="sr-only"> mode</span>
    </button>
  );
}
