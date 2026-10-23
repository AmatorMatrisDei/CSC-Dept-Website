import { useSyncExternalStore } from "react";

// One short message at a time for the editors' pill ("Saved as a draft..."). A new message
// replaces the one showing. The pill renders it in a live region so screen readers announce it.
export type Toast = { id: number; text: string };

let current: Toast | null = null;
let nextId = 1;
let timer: number | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function set(next: Toast | null) {
  current = next;
  listeners.forEach((l) => l());
}

export function showToast(text: string, seconds = 6) {
  window.clearTimeout(timer);
  set({ id: nextId++, text });
  timer = window.setTimeout(() => set(null), seconds * 1000);
}

export function useToast(): Toast | null {
  return useSyncExternalStore(subscribe, () => current);
}

export const DRAFT_SAVED = "Saved as a draft. Visitors don't see it until you publish.";

// For changes that go live at once, with no draft step.
export const LIVE_SAVED = "Saved. It's live now.";
