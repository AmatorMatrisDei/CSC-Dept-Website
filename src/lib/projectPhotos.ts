import { removeUploads, uploadPhotoTo } from "./account";
import { getProject } from "./content";
import { currentRecordDraft, saveRecordDraft, withProjectDraft, type GalleryEntry } from "./recordDrafts";
import { supabase } from "./supabase";
import type { ProjectView } from "./types";

// Admin edits to a project's pictures: the cover photo (shown on cards and the carousel) and the
// gallery on the project page. Photos live in projects/<project id>/, which only admins can write
// to. A new photo is uploaded at once but only becomes part of the project when the editor
// publishes; the project's draft says which photos it will have. A photo that is only in the draft
// is deleted as soon as it is replaced or removed; a live one is deleted after publishing.
// Each function returns an error message, or null when it worked.
//
// `project` is the project as the editor sees it (with their draft), `live` is the published one.

const folder = (projectId: string) => `projects/${projectId}`;

// Changes run one at a time, each starting from the draft as the one before left it, so two quick
// edits (a description, then a caption) never overwrite each other.
let queue: Promise<unknown> = Promise.resolve();

function attempt(work: () => Promise<string | null>): Promise<string | null> {
  const run = queue.then(work).catch((e) => (e instanceof Error ? e.message : "Something went wrong."));
  queue = run;
  return run;
}

const latest = (live: ProjectView) => withProjectDraft(live, currentRecordDraft("projects", live.slug));

const isLive = (live: ProjectView, path: string | null) =>
  path !== null && (live.thumbnail_path === path || live.image_paths.includes(path));

// Photos that publishing replaced stay in the photo history, so their files must not be deleted.
async function isKept(path: string) {
  if (!supabase) return false;
  const { data } = await supabase.from("record_photo_history").select("id").eq("storage_path", path).limit(1);
  return (data?.length ?? 0) > 0;
}

// Deletes a photo file that only a draft knew about.
async function dropIfDraftOnly(live: ProjectView, path: string | null) {
  if (path && !isLive(live, path) && !(await isKept(path))) await removeUploads([path]).catch(() => undefined);
}

export type PhotoVersion = {
  id: number;
  project_slug: string;
  kind: "cover" | "gallery";
  storage_path: string;
  alt_text: string;
  caption: string;
  replaced_at: string;
};

// Photos that publishing replaced or removed, newest first.
export async function loadPhotoHistory(limit = 30): Promise<PhotoVersion[] | string> {
  if (!supabase) return "History is not available.";
  const { data, error } = await supabase
    .from("record_photo_history")
    .select("id, project_slug, kind, storage_path, alt_text, caption, replaced_at")
    .order("replaced_at", { ascending: false })
    .limit(limit)
    .returns<PhotoVersion[]>();
  if (error) return "Could not load the history: " + error.message;
  return data;
}

// Puts a kept photo back into its project's draft: as the cover, or added to the end of the gallery.
export function restorePhotoVersion(entry: PhotoVersion) {
  return attempt(async () => {
    const live = await getProject(entry.project_slug);
    if (!live) return "That project no longer exists.";
    const project = latest(live);
    const alt = entry.alt_text.trim() || `Photo of ${live.title}`;
    if (entry.kind === "cover") {
      const before = project.thumbnail_path;
      const error = await saveRecordDraft("projects", live.slug, { thumbnail_path: entry.storage_path, thumbnail_alt: alt }, undefined, live.date_updated);
      if (!error) await dropIfDraftOnly(live, before);
      return error;
    }
    if (project.image_paths.includes(entry.storage_path)) return "That photo is already on the project.";
    return saveGallery(live, [...galleryOf(project), { path: entry.storage_path, alt_text: alt, caption: entry.caption }]);
  });
}

export const galleryOf = (project: ProjectView): GalleryEntry[] =>
  project.image_paths.map((path, i) => ({
    path,
    alt_text: project.images[i].alt,
    caption: project.images[i].caption ?? "",
  }));

const saveGallery = (live: ProjectView, gallery: GalleryEntry[]) =>
  saveRecordDraft("projects", live.slug, {}, gallery, live.date_updated);

export function setCoverPhoto(project: ProjectView, live: ProjectView, file: File, alt: string) {
  return attempt(async () => {
    const before = latest(live).thumbnail_path;
    const path = await uploadPhotoTo(folder(project.id), file);
    const error = await saveRecordDraft("projects", live.slug, { thumbnail_path: path, thumbnail_alt: alt }, undefined, live.date_updated);
    if (error) {
      await removeUploads([path]).catch(() => undefined);
      return error;
    }
    await dropIfDraftOnly(live, before);
    return null;
  });
}

export function removeCoverPhoto(project: ProjectView, live: ProjectView) {
  return attempt(async () => {
    const before = latest(live).thumbnail_path;
    const error = await saveRecordDraft("projects", live.slug, { thumbnail_path: null, thumbnail_alt: null }, undefined, live.date_updated);
    if (!error) await dropIfDraftOnly(live, before);
    return error;
  });
}

export function addGalleryPhoto(project: ProjectView, live: ProjectView, file: File, alt: string) {
  return attempt(async () => {
    const path = await uploadPhotoTo(folder(project.id), file);
    const error = await saveGallery(live, [...galleryOf(latest(live)), { path, alt_text: alt, caption: "" }]);
    if (error) await removeUploads([path]).catch(() => undefined);
    return error;
  });
}

export function changeGalleryPhoto(project: ProjectView, live: ProjectView, path: string, patch: { alt_text?: string; caption?: string }) {
  return attempt(async () => {
    if (patch.alt_text !== undefined && patch.alt_text.trim() === "") {
      return "Every photo needs a description (alt text) for people who can't see it.";
    }
    return saveGallery(live, galleryOf(latest(live)).map((g) => (g.path === path ? { ...g, ...patch } : g)));
  });
}

// A new file in place of a gallery photo, keeping its description, caption and position.
export function replaceGalleryPhoto(project: ProjectView, live: ProjectView, path: string, file: File) {
  return attempt(async () => {
    const newPath = await uploadPhotoTo(folder(project.id), file);
    const error = await saveGallery(live, galleryOf(latest(live)).map((g) => (g.path === path ? { ...g, path: newPath } : g)));
    if (error) await removeUploads([newPath]).catch(() => undefined);
    else await dropIfDraftOnly(live, path);
    return error;
  });
}

export function removeGalleryPhoto(project: ProjectView, live: ProjectView, path: string) {
  return attempt(async () => {
    const error = await saveGallery(live, galleryOf(latest(live)).filter((g) => g.path !== path));
    if (!error) await dropIfDraftOnly(live, path);
    return error;
  });
}

// `paths` is the whole gallery in its new order.
export function reorderGallery(project: ProjectView, live: ProjectView, paths: string[]) {
  return attempt(() => {
    const byPath = new Map(galleryOf(latest(live)).map((g) => [g.path, g]));
    return saveGallery(live, paths.flatMap((p) => byPath.get(p) ?? []));
  });
}
