"use client";

import { useEffect, useSyncExternalStore } from "react";

// TEMPORARY: buttons to compare palettes and light/dark. Delete this file (and its use in
// SiteHeader) once one is chosen. The choices live on <html data-palette> and <html data-theme>.
const PALETTES = [
  { value: "cloister", label: "Classic" },
  { value: "steel", label: "Charcoal & Gold" },
  { value: "ink", label: "Ink & Gold" },
];
const THEMES = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function createSetting(attr: "palette" | "theme", fallback: string, allowed: { value: string }[]) {
  const listeners = new Set<() => void>();
  return {
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    get: () => document.documentElement.dataset[attr] ?? fallback,
    server: () => fallback,
    set(value: string) {
      if (value === fallback && attr === "theme") delete document.documentElement.dataset[attr];
      else document.documentElement.dataset[attr] = value;
      listeners.forEach((fn) => fn());
      try {
        localStorage.setItem(attr, value);
      } catch {}
    },
    restore() {
      try {
        const saved = localStorage.getItem(attr);
        if (saved && allowed.some((a) => a.value === saved)) this.set(saved);
      } catch {}
    },
  };
}

const palette = createSetting("palette", "cloister", PALETTES);
const theme = createSetting("theme", "system", THEMES);

function Group({
  label,
  options,
  current,
  onChoose,
}: {
  label: string;
  options: { value: string; label: string }[];
  current: string;
  onChoose: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={label}>
      <span className="pr-1">{label}:</span>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={current === o.value}
          onClick={() => onChoose(o.value)}
          className={`min-h-11 rounded border px-3 text-sm ${
            current === o.value
              ? "border-accent bg-accent text-accent-foreground"
              : "border-border bg-background text-foreground hover:bg-surface"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function PaletteSwitcher() {
  const currentPalette = useSyncExternalStore(palette.subscribe, palette.get, palette.server);
  const currentTheme = useSyncExternalStore(theme.subscribe, theme.get, theme.server);

  useEffect(() => {
    palette.restore();
    theme.restore();
  }, []);

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-6 text-xs text-muted">
      <Group label="Palette (temporary)" options={PALETTES} current={currentPalette} onChoose={palette.set} />
      <Group label="Mode" options={THEMES} current={currentTheme} onChoose={theme.set} />
    </div>
  );
}
