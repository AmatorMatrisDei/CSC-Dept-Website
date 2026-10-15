import {
  getInternship,
  getProjectForEdit,
  type ChangeStatus,
  type ConsentScope,
  type Submission,
} from "./account";
import { supabase } from "./supabase";

// What reviewers (TAs, faculty and admins) read to approve, reject or return a submission
// (FR-3.4, FR-3.5). review_change() checks the reviewer's role and applies approved changes.

export type QueueItem = Submission & {
  submitter: { name: string; slug: string } | null;
  reviewer: { name: string } | null;
};

export type ReviewDetail = QueueItem & {
  // The live row the submission changes, when there is one, in the same shape as the proposal.
  current: Record<string, unknown> | null;
  // The submitter's active consents, which decide what their profile may show.
  consents: ConsentScope[];
  // Display names for the ids in the submission and the live row.
  names: Record<string, string>;
};

const QUEUE_SELECT = `id, submitter_id, target_type, action, target_id, proposed_data, status, reason, created_at,
  reviewed_at, submitter:profiles!pending_changes_submitter_id_fkey(name, slug),
  reviewer:profiles!pending_changes_reviewer_id_fkey(name)`;

const PROFILE_FIELDS = `name, headline, background, major, class_year, photo_path, contact_email, contact_phone,
  website_url, github_url, linkedin_url, skills, clubs_roles`;

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

// Waiting: oldest first, so nobody waits longest. Decided: the latest 50 decisions. `titles`
// names the live projects and internships the submissions change.
export async function getQueue(
  view: "waiting" | "decided",
  version = 0,
): Promise<{ items: QueueItem[]; titles: Record<string, string> }> {
  void version;
  const db = client();
  const statuses: ChangeStatus[] = view === "waiting" ? ["pending"] : ["approved", "rejected", "changes_requested"];
  const { data, error } = await db.from("pending_changes").select(QUEUE_SELECT).in("status", statuses)
    .order(view === "waiting" ? "created_at" : "reviewed_at", { ascending: view === "waiting" })
    .limit(view === "waiting" ? 200 : 50).returns<QueueItem[]>();
  if (error) throw error;

  const targets = (type: string) => [...new Set(data.flatMap((s) => (s.target_type === type && s.target_id ? [s.target_id] : [])))];
  const [projects, internships] = await Promise.all([
    targets("project").length ? db.from("projects").select("id, title").in("id", targets("project")) : null,
    targets("internship").length ? db.from("internships").select("id, company").in("id", targets("internship")) : null,
  ]);
  const titles: Record<string, string> = {};
  for (const row of (projects?.data ?? []) as { id: string; title: string }[]) titles[row.id] = row.title;
  for (const row of (internships?.data ?? []) as { id: string; company: string }[]) titles[row.id] = row.company;
  return { items: data, titles };
}

export async function getReviewDetail(id: string, version = 0): Promise<ReviewDetail | null> {
  void version;
  const db = client();
  const { data: change, error } = await db.from("pending_changes").select(QUEUE_SELECT).eq("id", id)
    .maybeSingle<QueueItem>();
  if (error) throw error;
  if (!change) return null;

  let current: Record<string, unknown> | null = null;
  if (change.target_type === "profile") {
    const { data, error } = await db.from("profiles").select(`${PROFILE_FIELDS}, visible`).eq("id", change.submitter_id)
      .maybeSingle<Record<string, unknown>>();
    if (error) throw error;
    current = data;
  } else if (change.target_id && change.target_type === "project") {
    current = await getProjectForEdit(change.target_id);
  } else if (change.target_id && change.target_type === "internship") {
    current = await getInternship(change.target_id);
  }

  const [consents, names] = await Promise.all([
    db.from("consents").select("scope").eq("student_id", change.submitter_id).is("revoked_at", null)
      .returns<{ scope: ConsentScope }[]>(),
    lookupNames([change.proposed_data, current]),
  ]);
  if (consents.error) throw consents.error;
  return { ...change, current, consents: (consents.data ?? []).map((c) => c.scope), names };
}

// Names for the students, faculty, organizations, categories and sub-departments a project
// submission refers to by id.
async function lookupNames(sources: (Record<string, unknown> | null)[]): Promise<Record<string, string>> {
  const ids = { profiles: new Set<string>(), faculty: new Set<string>(), organizations: new Set<string>() };
  let taxonomy = false;
  for (const source of sources) {
    if (!source) continue;
    for (const m of (source.members as { student_id?: string }[] | undefined) ?? []) {
      if (m.student_id) ids.profiles.add(m.student_id);
    }
    if (typeof source.primary_contact_student_id === "string") ids.profiles.add(source.primary_contact_student_id);
    for (const f of (source.advisor_ids as string[] | undefined) ?? []) ids.faculty.add(f);
    for (const o of (source.organization_ids as string[] | undefined) ?? []) ids.organizations.add(o);
    if (source.category_id || source.sub_department_id) taxonomy = true;
  }

  const db = client();
  const queries = [
    ids.profiles.size ? db.from("profiles").select("id, name").in("id", [...ids.profiles]) : null,
    ids.faculty.size ? db.from("faculty").select("id, name").in("id", [...ids.faculty]) : null,
    ids.organizations.size ? db.from("organizations").select("id, name").in("id", [...ids.organizations]) : null,
    taxonomy ? db.from("categories").select("id, name") : null,
    taxonomy ? db.from("sub_departments").select("id, name") : null,
  ];
  const names: Record<string, string> = {};
  for (const result of await Promise.all(queries.map((q) => q?.returns<{ id: string; name: string }[]>()))) {
    if (!result) continue;
    if (result.error) throw result.error;
    for (const row of result.data ?? []) names[row.id] = row.name;
  }
  return names;
}

export async function reviewChange(id: string, decision: "approved" | "rejected" | "changes_requested", note: string) {
  const { error } = await client().rpc("review_change", { change_id: id, decision, note: note.trim() || null });
  if (error) throw error;
}
