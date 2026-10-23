import { useEffect, useRef, useSyncExternalStore } from "react";
import { removeUploads } from "./account";
import { forgetCachedContent } from "./content";
import type { Json } from "./database.types";
import { mediaUrl, supabase } from "./supabase";
import { DRAFT_SAVED, showToast } from "./toast";
import type { Faculty, Photo, ProjectView, Student } from "./types";

// Edits to a project, student or faculty page, and a project's photos, wait here as drafts until
// an editor publishes (the Publish button saves them together with the page text). One draft per
// record. `patch` holds the changed database columns; `gallery` is a project's whole photo list
// as the editor wants it. Photo files are uploaded at once but nothing points at them until
// publish; files that stop being used are deleted after publishing or discarding.

export type RecordTable = "projects" | "profiles" | "faculty";
export type GalleryEntry = { path: string; alt_text: string; caption: string };
export type RecordDraft = {
  table_name: RecordTable;
  row_slug: string;
  patch: Record<string, unknown>;
  gallery: GalleryEntry[] | null;
  base_updated_at: string;
};

// Drafts are loaded when an editor opens Edit mode (the edit bar), never for ordinary visitors.
let drafts: RecordDraft[] = [];
let publishes = 0; // counts publishes and discards, so open pages know to reload
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function announce() {
  listeners.forEach((l) => l());
}

// Reloads a page's data after the editor publishes or discards, so its next save starts from the
// new live copy and not a stale one.
export function useReloadOnPublish(reload: () => void) {
  const count = useSyncExternalStore(subscribe, () => publishes);
  const seen = useRef(count);
  const latest = useRef(reload);
  useEffect(() => {
    latest.current = reload;
  });
  useEffect(() => {
    if (count !== seen.current) {
      seen.current = count;
      latest.current();
    }
  }, [count]);
}

export async function loadRecordDrafts() {
  if (!supabase) return;
  const { data, error } = await supabase
    .from("record_draft")
    .select("table_name, row_slug, patch, gallery, base_updated_at")
    .returns<RecordDraft[]>();
  if (error || !data) return;
  drafts = data;
  announce();
}

// The draft as it is right now (not as of the last render).
export const currentRecordDraft = (table: RecordTable, slug: string) =>
  drafts.find((d) => d.table_name === table && d.row_slug === slug);

export function useRecordDraft(table: RecordTable, slug: string): RecordDraft | undefined {
  const all = useSyncExternalStore(subscribe, () => drafts);
  return all.find((d) => d.table_name === table && d.row_slug === slug);
}

// "projects/campus-robot" and so on, for the bar's count of unpublished changes.
export function useRecordDraftNames(): string[] {
  const all = useSyncExternalStore(subscribe, () => drafts);
  return all.map((d) => `${d.table_name}/${d.row_slug}`);
}

// Adds to the record's draft. `seen` is the record's updated_at as the editor saw it, when known.
export async function saveRecordDraft(
  table: RecordTable,
  slug: string,
  patch: Record<string, unknown>,
  gallery?: GalleryEntry[],
  seen?: string,
): Promise<string | null> {
  if (!supabase) return "Saving is not available.";
  const { error } = await supabase.rpc("save_record_draft", {
    draft_table: table,
    draft_slug: slug,
    draft_patch: patch as Json,
    draft_gallery: (gallery ?? null) as Json,
    seen_updated_at: seen ?? null,
  });
  if (error) return "Could not save: " + error.message;
  await loadRecordDrafts();
  showToast(DRAFT_SAVED);
  return null;
}

export type RecordHistoryEntry = {
  id: number;
  table_name: RecordTable;
  row_slug: string;
  before: Record<string, unknown>;
  replaced_at: string;
  batch: number | null;
};

// Earlier values of project, student and faculty details, newest first.
export async function loadRecordHistory(limit = 30): Promise<RecordHistoryEntry[] | string> {
  if (!supabase) return "History is not available.";
  const { data, error } = await supabase
    .from("record_history")
    .select("id, table_name, row_slug, before, replaced_at, batch")
    .order("replaced_at", { ascending: false })
    .limit(limit)
    .returns<RecordHistoryEntry[]>();
  if (error) return "Could not load the history: " + error.message;
  return data;
}

// Puts earlier values back as a draft, to be looked over and published like any edit.
export async function restoreRecordVersion(id: number): Promise<string | null> {
  if (!supabase) return "Restoring is not available.";
  const { error } = await supabase.rpc("restore_record_version", { history_id: id });
  if (error) return "Could not restore: " + error.message;
  await loadRecordDrafts();
  return null;
}

export const recordDraftSnapshot = () => drafts;

// Whether this column has an unpublished change (for the amber dot beside the text).
export const isDrafted = (draft: RecordDraft | undefined, column: string) => !!draft && column in draft.patch;

// Undoes one record's draft, and deletes the photo files only it used.
export async function discardRecordDraft(table: RecordTable, slug: string): Promise<string | null> {
  if (!supabase) return "Discarding is not available.";
  const { data, error } = await supabase.rpc("discard_record_drafts", { only_rows: [`${table}/${slug}`] });
  if (error) return "Could not undo: " + error.message;
  await removeUploads(data ?? []).catch(() => undefined);
  forgetCachedContent();
  await loadRecordDrafts();
  publishes++;
  announce();
  return null;
}

// Throws away every record draft and the photo files only they used.
export async function discardRecordDrafts(): Promise<string | null> {
  if (!supabase) return "Discarding is not available.";
  const { data, error } = await supabase.rpc("discard_record_drafts");
  if (error) return "Could not discard: " + error.message;
  await removeUploads(data ?? []).catch(() => undefined);
  forgetCachedContent();
  await loadRecordDrafts();
  publishes++;
  announce();
  return null;
}

// Deletes the given photo files, but only those the database says nothing uses any more (not
// live, not in any editor's draft, not in the history, not in a pending submission).
export async function releaseFiles(paths: Array<string | null | undefined>) {
  const wanted = paths.filter((p): p is string => typeof p === "string" && p !== "");
  if (!supabase || wanted.length === 0) return;
  const { data } = await supabase.rpc("release_draft_files", { paths: wanted });
  await removeUploads(data ?? []).catch(() => undefined);
}

// After publishing: delete the photo files that are no longer used, and show the new data.
export async function finishRecordPublish(removedPaths: string[]) {
  await removeUploads(removedPaths).catch(() => undefined);
  forgetCachedContent();
  await loadRecordDrafts();
  publishes++;
  announce();
}

// Showing a draft ---------------------------------------------------------------------------------

function photo(path: string | null, alt: string, caption = ""): Photo | null {
  const url = mediaUrl(path);
  return url ? { url, alt, ...(caption.trim() ? { caption: caption.trim() } : {}) } : null;
}

const has = (patch: Record<string, unknown>, key: string) => key in patch;
const text = (value: unknown) => (typeof value === "string" ? value : "");
const orNull = (value: unknown) => (typeof value === "string" ? value : null);

// The project as it will look once the draft is published.
export function withProjectDraft(project: ProjectView, draft: RecordDraft | undefined): ProjectView {
  if (!draft) return project;
  const { patch, gallery } = draft;
  const urls: Record<string, string> = Object.fromEntries(project.links.map((l) => [l.label, l.url]));
  for (const [key, label] of [["repo_url", "Source code"], ["demo_url", "Live demo"], ["poster_url", "Poster"]] as const) {
    if (has(patch, key)) {
      const url = orNull(patch[key]);
      if (url) urls[label] = url;
      else delete urls[label];
    }
  }
  const thumbnail_path = has(patch, "thumbnail_path") ? orNull(patch.thumbnail_path) : project.thumbnail_path;
  const thumbnail_alt = has(patch, "thumbnail_alt") ? text(patch.thumbnail_alt) : (project.thumbnail?.alt ?? "");
  const shown = gallery?.flatMap((g) => {
    const p = photo(g.path, g.alt_text, g.caption);
    return p ? [{ photo: p, path: g.path }] : [];
  });
  return {
    ...project,
    title: has(patch, "title") ? text(patch.title) : project.title,
    summary: has(patch, "summary") ? text(patch.summary) : project.summary,
    description: has(patch, "description") ? text(patch.description) : project.description,
    contact_email: has(patch, "primary_contact_email") ? orNull(patch.primary_contact_email) : project.contact_email,
    contact_phone: has(patch, "primary_contact_phone") ? orNull(patch.primary_contact_phone) : project.contact_phone,
    links: ["Source code", "Live demo", "Poster"].flatMap((label) => (urls[label] ? [{ label, url: urls[label] }] : [])),
    thumbnail_path,
    thumbnail: photo(thumbnail_path, thumbnail_alt),
    images: shown ? shown.map((s) => s.photo) : project.images,
    image_paths: shown ? shown.map((s) => s.path) : project.image_paths,
  };
}

export function withStudentDraft<T extends Student>(student: T, draft: RecordDraft | undefined): T {
  if (!draft) return student;
  const p = draft.patch;
  const list = (value: unknown, fallback: string[]) => (Array.isArray(value) ? value.map(String) : fallback);
  return {
    ...student,
    name: has(p, "name") ? text(p.name) : student.name,
    headline: has(p, "headline") ? text(p.headline) : student.headline,
    background: has(p, "background") ? text(p.background) : student.background,
    major: has(p, "major") ? orNull(p.major) : student.major,
    email: has(p, "contact_email") ? orNull(p.contact_email) : student.email,
    phone: has(p, "contact_phone") ? orNull(p.contact_phone) : student.phone,
    linkedin_url: has(p, "linkedin_url") ? orNull(p.linkedin_url) : student.linkedin_url,
    github_url: has(p, "github_url") ? orNull(p.github_url) : student.github_url,
    website_url: has(p, "website_url") ? orNull(p.website_url) : student.website_url,
    skills: has(p, "skills") ? list(p.skills, student.skills) : student.skills,
    clubs_roles: has(p, "clubs_roles") ? list(p.clubs_roles, student.clubs_roles) : student.clubs_roles,
    photo: has(p, "photo_path") ? photo(orNull(p.photo_path), student.name) : student.photo,
  };
}

export function withFacultyDraft<T extends Faculty>(person: T, draft: RecordDraft | undefined): T {
  if (!draft) return person;
  const p = draft.patch;
  return {
    ...person,
    name: has(p, "name") ? text(p.name) : person.name,
    title: has(p, "title") ? text(p.title) : person.title,
    email: has(p, "email") ? orNull(p.email) : person.email,
    photo: has(p, "photo_path") ? photo(orNull(p.photo_path), person.name) : person.photo,
  };
}
