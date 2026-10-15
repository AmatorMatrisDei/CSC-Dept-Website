import { supabase } from "./supabase";

// Everything a signed-in student or reviewer does with the review queue. Students never write to
// live tables: they add a row to pending_changes and a reviewer approves it (see
// supabase/migrations/*_review_queue.sql). The database re-checks every rule here.

function client() {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

export type ChangeStatus = "pending" | "approved" | "rejected" | "changes_requested" | "withdrawn";
export type Change = {
  id: string;
  submitter_id: string;
  target_type: "profile" | "project" | "internship";
  action: "create" | "update" | "delete";
  target_id: string | null;
  proposed_data: Record<string, unknown>;
  status: ChangeStatus;
  reason: string | null;
  created_at: string;
  submitter?: { name: string } | null;
};

export type MyProfile = {
  id: string;
  slug: string | null;
  name: string;
  headline: string;
  background: string;
  major: string | null;
  class_year: number | null;
  contact_email: string | null;
  contact_phone: string | null;
  linkedin_url: string | null;
  skills: string[];
  clubs_roles: string[];
  visible: boolean;
  photo_path: string | null;
};

const PROFILE_COLUMNS =
  "id, slug, name, headline, background, major, class_year, contact_email, contact_phone, linkedin_url, skills, clubs_roles, visible, photo_path";

export async function getMyProfile(userId: string): Promise<MyProfile | null> {
  const { data, error } = await client().from("profiles").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle();
  if (error) throw error;
  return data as MyProfile | null;
}

export type ConsentScope = "directory" | "photo" | "email" | "phone";

export async function getMyConsents(userId: string): Promise<ConsentScope[]> {
  const { data, error } = await client()
    .from("consents")
    .select("scope")
    .eq("student_id", userId)
    .is("revoked_at", null);
  if (error) throw error;
  return data.map((r) => r.scope as ConsentScope);
}

// Records the student's permission for each scope they ticked. Scopes already granted are kept.
export async function grantConsents(userId: string, scopes: ConsentScope[]): Promise<string | null> {
  const have = await getMyConsents(userId);
  const wanted = scopes.filter((s) => !have.includes(s));
  if (wanted.length === 0) return null;
  const { error } = await client()
    .from("consents")
    .insert(wanted.map((scope) => ({ student_id: userId, scope })));
  return error ? "Could not save your choices: " + error.message : null;
}

// Uploads a profile photo to the student's own folder and returns its storage path.
export async function uploadAvatar(userId: string, file: File): Promise<{ path: string | null; error: string | null }> {
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `avatars/${userId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await client().storage.from("media").upload(path, file, { contentType: file.type });
  return error ? { path: null, error: "Could not upload the photo: " + error.message } : { path, error: null };
}

export async function submitChange(
  target_type: Change["target_type"],
  action: Change["action"],
  proposed_data: Record<string, unknown>,
  target_id?: string,
): Promise<string | null> {
  const { error } = await client()
    .from("pending_changes")
    .insert({ target_type, action, proposed_data, ...(target_id ? { target_id } : {}) });
  return error ? error.message : null;
}

export async function getMySubmissions(userId: string): Promise<Change[]> {
  const { data, error } = await client()
    .from("pending_changes")
    .select("*")
    .eq("submitter_id", userId)
    .order("created_at", { ascending: false })
    .returns<Change[]>();
  if (error) throw error;
  return data;
}

export async function withdrawSubmission(id: string): Promise<string | null> {
  const { error } = await client().from("pending_changes").update({ status: "withdrawn" }).eq("id", id);
  return error ? error.message : null;
}

export type MyProject = { slug: string; title: string; role: string; canEdit: boolean; confirmed: boolean };

export async function getMyProjects(userId: string): Promise<MyProject[]> {
  const { data, error } = await client()
    .from("contributions")
    .select("role, can_edit, confirmed, projects(slug, title)")
    .eq("student_id", userId)
    .returns<{ role: string; can_edit: boolean; confirmed: boolean; projects: { slug: string; title: string } | null }[]>();
  if (error) throw error;
  return data.flatMap((c) =>
    c.projects ? [{ slug: c.projects.slug, title: c.projects.title, role: c.role, canEdit: c.can_edit, confirmed: c.confirmed }] : [],
  );
}

// Looks up the ids the database wants for a project submission (the forms use slugs).
export async function getReferenceIds() {
  const [categories, departments, faculty] = await Promise.all([
    client().from("categories").select("id, slug"),
    client().from("sub_departments").select("id, slug"),
    client().from("faculty").select("id, slug"),
  ]);
  const toMap = (r: { data: { id: string; slug: string }[] | null }) =>
    new Map((r.data ?? []).map((row) => [row.slug, row.id]));
  return { categories: toMap(categories), departments: toMap(departments), faculty: toMap(faculty) };
}

export async function getProjectId(slug: string): Promise<string | null> {
  const { data } = await client().from("projects").select("id").eq("slug", slug).maybeSingle();
  return data?.id ?? null;
}

// Reviewers -----------------------------------------------------------------------------------

export async function getReviewQueue(status: ChangeStatus = "pending"): Promise<Change[]> {
  const { data, error } = await client()
    .from("pending_changes")
    .select("*, submitter:profiles!pending_changes_submitter_id_fkey(name)")
    .eq("status", status)
    .order("created_at")
    .returns<Change[]>();
  if (error) throw error;
  return data;
}

// What the target looks like now, so reviewers can see what a change replaces.
export async function getCurrentValues(change: Change): Promise<Record<string, unknown> | null> {
  if (change.action !== "update" || !change.target_id) return null;
  const table = change.target_type === "profile" ? "profiles" : change.target_type === "project" ? "projects" : "internships";
  const { data } = await client().from(table).select("*").eq("id", change.target_id).maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

export async function reviewChange(
  id: string,
  decision: "approved" | "rejected" | "changes_requested",
  note: string,
): Promise<string | null> {
  const { error } = await client().rpc("review_change", { change_id: id, decision, note: note || null });
  return error ? error.message : null;
}
