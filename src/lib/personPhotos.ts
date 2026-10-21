import { removeUploads, uploadPhotoTo } from "./account";
import { currentRecordDraft, loadRecordDrafts, releaseFiles, saveRecordDraft } from "./recordDrafts";
import type { Faculty, Student } from "./types";

// Editors' changes to a student's or faculty member's photo. The new file is uploaded at once but
// only becomes their photo when the editor publishes; the draft says which file it will be. Each
// function returns an error message, or null when it worked.

type Table = "profiles" | "faculty";
type Person = Pick<Student | Faculty, "id" | "slug" | "date_updated" | "photo">;

// Students' photos live in their own avatars folder, faculty photos in faculty/<id>.
const folder = (table: Table, person: Person) => (table === "profiles" ? `avatars/${person.id}` : `faculty/${person.id}`);

async function change(table: Table, live: Person, photoPath: (() => Promise<string>) | null) {
  await loadRecordDrafts();
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
  // The database decides whether the earlier photo's file is still used (live, a draft, the history).
  await releaseFiles([typeof earlier === "string" ? earlier : null]);
  return null;
}

export const setPersonPhoto = (table: Table, live: Person, file: File) =>
  change(table, live, () => uploadPhotoTo(folder(table, live), file));

export const removePersonPhoto = (table: Table, live: Person) => change(table, live, null);
