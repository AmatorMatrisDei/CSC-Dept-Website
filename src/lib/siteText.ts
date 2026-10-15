import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";

// Page wording that staff can edit. The pages carry their own default text; a row in
// site_content (key, value) replaces the default for that key. If the table is missing or
// unreachable the defaults are used, so the site never breaks over this.

let texts: Record<string, string> = {};
let started = false;
const listeners = new Set<() => void>();

function publish(next: Record<string, string>) {
  texts = next;
  listeners.forEach((l) => l());
}

async function load() {
  if (!supabase) return;
  const { data, error } = await supabase.from("site_content").select("key, value");
  if (error || !data) return;
  publish(Object.fromEntries(data.map((r: { key: string; value: string }) => [r.key, r.value])));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!started) {
    started = true;
    void load();
  }
  return () => listeners.delete(listener);
}

export function useSiteText(key: string, fallback: string): string {
  const all = useSyncExternalStore(subscribe, () => texts);
  return all[key] ?? fallback;
}

export async function saveSiteText(key: string, value: string): Promise<string | null> {
  if (!supabase) return "Saving is not available.";
  const { error } = await supabase.from("site_content").upsert({ key, value });
  if (error) return "Could not save: " + error.message;
  publish({ ...texts, [key]: value });
  return null;
}
