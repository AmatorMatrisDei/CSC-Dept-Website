import { useSyncExternalStore } from "react";
import { discardRecordDrafts, finishRecordPublish } from "./recordDrafts";
import { supabase } from "./supabase";
import { DRAFT_SAVED, showToast } from "./toast";

// Page wording that staff can edit. The pages carry their own default text; a row in
// site_content (key, value) replaces the default for that key. If the table is missing or
// unreachable the defaults are used, so the site never breaks over this.
//
// Editors save changes as drafts. Drafts are only shown to them (in Edit mode) until they publish.
// Each draft remembers the updated_at of the live text the editor was looking at, so publishing
// can tell if someone else changed that text in the meantime.

export type ListItem = { title: string; text: string; url: string };
export type HistoryEntry = { id: number; key: string; value: string; replaced_at: string; batch: number | null };

let texts: Record<string, string> = {};
let stamps: Record<string, string> = {}; // updated_at of each live text, as loaded
let drafts: Record<string, string> = {};
let started = false;
const listeners = new Set<() => void>();

function changed() {
  listeners.forEach((l) => l());
}

async function load() {
  if (!supabase) return;
  const { data, error } = await supabase.from("site_content").select("key, value, updated_at");
  if (error || !data) return;
  texts = Object.fromEntries(data.map((r) => [r.key, r.value]));
  stamps = Object.fromEntries(data.map((r) => [r.key, r.updated_at]));
  changed();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!started) {
    started = true;
    void load();
  }
  return () => listeners.delete(listener);
}

export function useSiteText(key: string, fallback: string, showDrafts = false): string {
  const all = useSyncExternalStore(subscribe, () => texts);
  const pending = useSyncExternalStore(subscribe, () => drafts);
  return (showDrafts ? pending[key] : undefined) ?? all[key] ?? fallback;
}

// A list stored under a key ending in ".items". Anything unreadable counts as an empty list.
export function parseList(value: string | undefined): ListItem[] {
  try {
    const parsed: unknown = JSON.parse(value ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.map((p) => ({
      title: String(p?.title ?? ""),
      text: String(p?.text ?? ""),
      url: String(p?.url ?? ""),
    }));
  } catch {
    return [];
  }
}

export function useSiteList(key: string, showDrafts = false): ListItem[] {
  return parseList(useSiteText(key, "[]", showDrafts));
}

// The live and drafted text right now, for describing what a draft changes.
export const siteTextSnapshot = () => ({ live: texts, drafts });

export function useIsDrafted(key: string): boolean {
  const pending = useSyncExternalStore(subscribe, () => drafts);
  return key in pending;
}

export function useDraftKeys(): string[] {
  const pending = useSyncExternalStore(subscribe, () => drafts);
  return Object.keys(pending).sort();
}

export async function loadSiteDrafts() {
  if (!supabase) return;
  const { data, error } = await supabase.from("site_content_draft").select("key, value");
  if (error || !data) return;
  drafts = Object.fromEntries(data.map((r) => [r.key, r.value]));
  changed();
}

// Saves a draft; it goes live when an editor publishes.
export async function saveSiteText(key: string, value: string): Promise<string | null> {
  if (!supabase) return "Saving is not available.";
  const { error } = await supabase.rpc("save_site_draft", {
    draft_key: key,
    draft_value: value,
    seen_updated_at: stamps[key],
  });
  if (error) return "Could not save: " + error.message;
  await loadSiteDrafts();
  showToast(DRAFT_SAVED);
  return null;
}

export const saveSiteList = (key: string, items: ListItem[]) =>
  saveSiteText(key, JSON.stringify(items));

// Changes a list one step at a time. Each change is built from the list as the draft is in the
// database right now, so quick edits (or a second editor's) are never written over by a stale copy.
let listQueue: Promise<unknown> = Promise.resolve();

export function changeSiteList(key: string, change: (items: ListItem[]) => ListItem[]): Promise<string | null> {
  const run = listQueue
    .then(async () => {
      await Promise.all([loadSiteDrafts(), load()]);
      return saveSiteList(key, change(parseList(drafts[key] ?? texts[key])));
    })
    .catch((e) => (e instanceof Error ? e.message : "Something went wrong."));
  listQueue = run;
  return run;
}

// Publishes every draft, or says which texts were changed by someone else in the meantime.
export async function publishSiteDrafts(): Promise<string | null> {
  if (!supabase) return "Publishing is not available.";
  const { data, error } = await supabase.rpc("publish_site_drafts");
  if (error) return "Could not publish: " + error.message;
  const result = data as { conflicts?: string[]; removed_paths?: string[] } | null;
  const conflicts = result?.conflicts ?? [];
  if (conflicts.length > 0) {
    return `Someone else changed ${conflicts.join(", ")} after you started. Discard your changes and edit again.`;
  }
  await Promise.all([load(), loadSiteDrafts(), finishRecordPublish(result?.removed_paths ?? [])]);
  return null;
}

// Undoes the draft of one text.
export async function discardSiteDraft(key: string): Promise<string | null> {
  if (!supabase) return "Discarding is not available.";
  const { error } = await supabase.rpc("discard_site_drafts", { only_keys: [key] });
  if (error) return "Could not undo: " + error.message;
  await loadSiteDrafts();
  return null;
}

export async function discardSiteDrafts(): Promise<string | null> {
  if (!supabase) return "Discarding is not available.";
  const { error } = await supabase.rpc("discard_site_drafts");
  if (error) return "Could not discard: " + error.message;
  await loadSiteDrafts();
  return discardRecordDrafts();
}

// Earlier versions of page text, newest first.
export async function loadSiteHistory(limit = 30): Promise<HistoryEntry[] | string> {
  if (!supabase) return "History is not available.";
  const { data, error } = await supabase
    .from("site_content_history")
    .select("id, key, value, replaced_at, batch")
    .order("replaced_at", { ascending: false })
    .limit(limit);
  if (error) return "Could not load the history: " + error.message;
  return data;
}

// Puts an earlier version back as a draft, to be looked over and published like any edit.
export async function restoreSiteText(id: number): Promise<string | null> {
  if (!supabase) return "Restoring is not available.";
  const { error } = await supabase.rpc("restore_site_text", { history_id: id });
  if (error) return "Could not restore: " + error.message;
  await Promise.all([load(), loadSiteDrafts()]);
  return null;
}
