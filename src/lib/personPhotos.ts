import { removeUploads, uploadPhotoTo } from "./account";
import { currentRecordDraft, saveRecordDraft } from "./recordDrafts";
import { mediaUrl, supabase } from "./supabase";
import type { Faculty, Student } from "./types";

// Editors' changes to a student's or faculty member's photo. The new file is uploaded at once but
// only becomes their photo when the editor publishes; the draft says which file it will be. Each
// function returns an error message, or null when it worked.

type Table = "profiles" | "faculty";
type Person = Pick<Student | Faculty, "id" | "slug" | "date_updated" | "photo">;

// Students' photos live in their own avatars folder, faculty photos in faculty/<id>.
const folder = (table: Table, person: Person) => (table === "profiles" ? `avatars/${person.id}` : `faculty/${person.id}`);

// Photos that publishing replaced stay in the history, so their files must not be deleted.
async function isKept(path: string) {
  if (!supabase) return false;
  const { data } = await supabase.from("record_history").select("id").filter("before->>photo_path", "eq", path).limit(1);
  return (data?.length ?? 0) > 0;
}

// Deletes a photo file that only a draft knew about.
async function dropIfDraftOnly(live: Person, path: unknown) {
  if (typeof path !== "string" || mediaUrl(path) === live.photo?.url || (await isKept(path))) return;
  await removeUploads([path]).catch(() => undefined);
}

async function change(table: Table, live: Person, photoPath: (() => Promise<string>) | null) {
  const earlier = currentRecordDraft(table, live.slug)?.patch.photo_path;
  let path: string | null = null;
  try {
    path = photoPath ? await photoPath() : null;
  } catch (e) {
    return e instanceof Error ? e.message : "Something went wrong.";
  }
  const error = await saveRecordDraft(table, live.slug, { photo_path: path }, undefined, live.date_updated);
  if (error) {
    if (path) await removeUploads([path]).catch(() => undefined);
    return error;
  }
  await dropIfDraftOnly(live, earlier);
  return null;
}

export const setPersonPhoto = (table: Table, live: Person, file: File) =>
  change(table, live, () => uploadPhotoTo(folder(table, live), file));

export const removePersonPhoto = (table: Table, live: Person) => change(table, live, null);
