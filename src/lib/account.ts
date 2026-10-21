import { supabase } from "./supabase";

// Everything a signed-in student reads and writes. Students never change live rows: each form
// sends a submission to `pending_changes`, and a reviewer's approval applies it (see
// supabase/migrations/*_review_queue.sql). Consents are the exception: they take effect at once.

export type Role = "student" | "reviewer" | "admin";
export type ConsentScope = "directory" | "photo" | "email" | "phone";
export type ChangeTarget = "profile" | "project" | "internship";
export type ChangeAction = "create" | "update" | "delete";
export type ChangeStatus = "pending" | "approved" | "rejected" | "changes_requested" | "withdrawn";

export type ProfileFields = {
  name: string;
  headline: string;
  background: string;
  major: string | null;
  class_year: number | null;
  photo_path: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website_url: string | null;
  github_url: string | null;
  linkedin_url: string | null;
  skills: string[];
  clubs_roles: string[];
};

export type Me = ProfileFields & { id: string; slug: string; role: Role; visible: boolean };

export type MemberInput = {
  student_id?: string;
  external_name?: string;
  role: string;
  term: string;
  can_edit: boolean;
};

export type ImageInput = { storage_path: string; alt_text: string; caption: string };

export type ProjectFields = {
  title: string;
  summary: string;
  description: string;
  status: "planned" | "active" | "completed";
  category_id: string;
  sub_department_id: string;
  date_started: string | null;
  date_finished: string | null;
  thumbnail_path: string | null;
  thumbnail_alt: string | null;
  tags: string[];
  repo_url: string | null;
  demo_url: string | null;
  poster_url: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  primary_contact_student_id: string | null;
  open_to_contributors: boolean;
  members: MemberInput[];
  advisor_ids: string[];
  organization_ids: string[];
  images: ImageInput[];
};

export type InternshipFields = { company: string; term: string; description: string };

export type Submission = {
  id: string;
  submitter_id: string;
  target_type: ChangeTarget;
  action: ChangeAction;
  target_id: string | null;
  proposed_data: Record<string, unknown>;
  status: ChangeStatus;
  reason: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export type MyProject = {
  id: string;
  slug: string;
  title: string;
  published: boolean;
  status: string;
  role: string | null;
  canEdit: boolean;
};

export type Listing = { id: string; role: string; project: { id: string; slug: string; title: string; published: boolean } };

export type Internship = InternshipFields & { id: string };

export type Dashboard = {
  me: Me;
  consents: ConsentScope[];
  submissions: Submission[];
  projects: MyProject[];
  listings: Listing[];
  internships: Internship[];
};

export type Option = { id: string; name: string };
export type FormOptions = {
  categories: (Option & { slug: string })[];
  subDepartments: Option[];
  faculty: Option[];
  organizations: (Option & { type: "grant" | "organization" })[];
  students: Option[];
};

// Open submissions are the ones a reviewer has not finished with.
export const OPEN_STATUSES: ChangeStatus[] = ["pending", "changes_requested"];

const ME_SELECT = `id, slug, role, visible, name, headline, background, major, class_year, photo_path,
  contact_email, contact_phone, website_url, github_url, linkedin_url, skills, clubs_roles`;

const SUBMISSION_SELECT = "id, submitter_id, target_type, action, target_id, proposed_data, status, reason, created_at, reviewed_at";

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

// The live database rejects bad input with messages written for developers. These are the ones a
// student can trigger from the forms, reworded.
export function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
  const rules: [RegExp, string][] = [
    [/https_url/, "Links must start with https:// and contain no spaces."],
    [/email_address/, "Enter one valid email address."],
    [/phone_number/, "Phone numbers are 7 to 25 characters: digits, spaces and + ( ) . -"],
    [/Invalid login credentials/i, "That email address and password don't match an account. If you've used Continue with Google or GitHub before, use that button instead."],
    [/Email not confirmed/i, "Confirm your email address first, using the link we sent you."],
    [/User already registered/i, "There's already an account with that email address. Sign in instead."],
    [/Password should be/i, "Choose a password of at least 8 characters."],
    [/invalid input syntax for type (date|integer)/, "Check the dates and the class year."],
    [/exceeded the maximum allowed size|Payload too large/i, "That photo is too large. Photos must be under 5 MB."],
    [/mime type .* is not supported/i, "Photos must be JPEG, PNG or WebP."],
    [/Failed to fetch|NetworkError/i, "Couldn't reach the server. Check your connection and try again."],
  ];
  return rules.find(([pattern]) => pattern.test(message))?.[1] ?? message;
}

// The dashboard ---------------------------------------------------------------------------------

type ContributionRow = {
  id: string;
  role: string;
  can_edit: boolean;
  confirmed: boolean;
  projects: { id: string; slug: string; title: string; published: boolean; status: string; created_by: string | null } | null;
};

// `version` only forces a reload after the page changes something.
export async function getDashboard(userId: string, version = 0): Promise<Dashboard> {
  void version;
  const db = client();
  const [me, consents, submissions, contributions, created, internships] = await Promise.all([
    db.from("profiles").select(ME_SELECT).eq("id", userId).single<Me>(),
    db.from("consents").select("scope").eq("student_id", userId).is("revoked_at", null).returns<{ scope: ConsentScope }[]>(),
    db.from("pending_changes").select(SUBMISSION_SELECT).eq("submitter_id", userId)
      .order("created_at", { ascending: false }).returns<Submission[]>(),
    db.from("contributions").select("id, role, can_edit, confirmed, projects(id, slug, title, published, status, created_by)")
      .eq("student_id", userId).returns<ContributionRow[]>(),
    db.from("projects").select("id, slug, title, published, status").eq("created_by", userId)
      .returns<Omit<MyProject, "role" | "canEdit">[]>(),
    db.from("internships").select("id, company, term, description").eq("student_id", userId)
      .order("created_at").returns<Internship[]>(),
  ]);
  for (const result of [me, consents, submissions, contributions, created, internships]) {
    if (result.error) throw result.error;
  }

  const projects = new Map<string, MyProject>();
  for (const p of created.data ?? []) projects.set(p.id, { ...p, role: null, canEdit: true });
  for (const c of contributions.data ?? []) {
    if (!c.projects || !c.confirmed) continue;
    const existing = projects.get(c.projects.id);
    projects.set(c.projects.id, {
      id: c.projects.id,
      slug: c.projects.slug,
      title: c.projects.title,
      published: c.projects.published,
      status: c.projects.status,
      role: c.role,
      canEdit: Boolean(existing?.canEdit) || c.can_edit,
    });
  }

  return {
    me: me.data!,
    consents: (consents.data ?? []).map((c) => c.scope),
    submissions: submissions.data ?? [],
    projects: [...projects.values()].sort((a, b) => a.title.localeCompare(b.title)),
    listings: (contributions.data ?? []).flatMap((c) =>
      !c.confirmed && c.projects ? [{ id: c.id, role: c.role, project: c.projects }] : []),
    internships: internships.data ?? [],
  };
}

export async function getMyRole(userId: string): Promise<{ role: Role; name: string } | null> {
  const { data, error } = await client().from("profiles").select("role, name").eq("id", userId)
    .maybeSingle<{ role: Role; name: string }>();
  if (error) throw error;
  return data;
}

// Consents --------------------------------------------------------------------------------------

export async function grantConsent(scope: ConsentScope): Promise<void> {
  const { error } = await client().from("consents").insert({ scope });
  if (error) throw error;
}

// Withdrawing takes effect at once: the database clears the matching photo, email or phone.
export async function revokeConsent(userId: string, scope: ConsentScope): Promise<void> {
  const { error } = await client().from("consents").update({ revoked_at: new Date().toISOString() })
    .eq("student_id", userId).eq("scope", scope).is("revoked_at", null);
  if (error) throw error;
}

// Submissions -----------------------------------------------------------------------------------

export async function submitChange(change: {
  target_type: ChangeTarget;
  action: ChangeAction;
  target_id?: string | null;
  proposed_data?: object;
}): Promise<string> {
  const { data, error } = await client().from("pending_changes")
    .insert({ ...change, proposed_data: change.proposed_data ?? {} }).select("id").single<{ id: string }>();
  if (error) throw error;
  return data.id;
}

// After a reviewer asks for changes, the student edits the same submission and sends it back.
export async function resubmitChange(id: string, proposed_data: object): Promise<void> {
  const { error } = await client().from("pending_changes").update({ proposed_data, status: "pending" }).eq("id", id);
  if (error) throw error;
}

export async function withdrawChange(id: string): Promise<void> {
  const { error } = await client().from("pending_changes").update({ status: "withdrawn" }).eq("id", id);
  if (error) throw error;
}

export async function getSubmission(id: string): Promise<Submission | null> {
  const { data, error } = await client().from("pending_changes").select(SUBMISSION_SELECT).eq("id", id)
    .maybeSingle<Submission>();
  if (error) throw error;
  return data;
}

// A student confirms or declines being listed on someone else's project (FR-3.7).
export async function respondToListing(id: string, accept: boolean): Promise<void> {
  const { error } = await client().rpc("respond_to_listing", { listing_id: id, accept });
  if (error) throw error;
}

// Form data -------------------------------------------------------------------------------------

export async function getFormOptions(): Promise<FormOptions> {
  const db = client();
  const [categories, subDepartments, faculty, organizations, students] = await Promise.all([
    db.from("categories").select("id, slug, name").order("sort_order").returns<FormOptions["categories"]>(),
    db.from("sub_departments").select("id, name").order("sort_order").returns<Option[]>(),
    db.from("faculty").select("id, name").order("name").returns<Option[]>(),
    db.from("organizations").select("id, name, type").order("name").returns<FormOptions["organizations"]>(),
    db.from("listed_students").select("id, name").order("name").returns<Option[]>(),
  ]);
  for (const result of [categories, subDepartments, faculty, organizations, students]) {
    if (result.error) throw result.error;
  }
  return {
    categories: categories.data ?? [],
    subDepartments: subDepartments.data ?? [],
    faculty: faculty.data ?? [],
    organizations: organizations.data ?? [],
    students: students.data ?? [],
  };
}

type ProjectRow = Omit<ProjectFields, "members" | "advisor_ids" | "organization_ids" | "images"> & {
  id: string;
  slug: string;
  contributions: (MemberInput & { student_id: string | null; external_name: string | null; sort_order: number })[];
  advising: { faculty_id: string }[];
  project_organizations: { organization_id: string }[];
  project_images: (ImageInput & { sort_order: number })[];
};

// A project as its editors see it, in the shape the project form submits.
export async function getProjectForEdit(id: string): Promise<(ProjectFields & { id: string; slug: string }) | null> {
  const { data, error } = await client().from("projects").select(`
      id, slug, title, summary, description, status, category_id, sub_department_id, date_started, date_finished,
      thumbnail_path, thumbnail_alt, tags, repo_url, demo_url, poster_url, primary_contact_email,
      primary_contact_phone, primary_contact_student_id, open_to_contributors,
      contributions(student_id, external_name, role, term, can_edit, sort_order),
      advising(faculty_id), project_organizations(organization_id),
      project_images(storage_path, alt_text, caption, sort_order)`)
    .eq("id", id).maybeSingle<ProjectRow>();
  if (error) throw error;
  if (!data) return null;
  const { contributions, advising, project_organizations, project_images, ...fields } = data;
  return {
    ...fields,
    members: [...contributions].sort((a, b) => a.sort_order - b.sort_order).map((c) => ({
      ...(c.student_id ? { student_id: c.student_id } : { external_name: c.external_name ?? "" }),
      role: c.role,
      term: c.term,
      can_edit: c.can_edit,
    })),
    advisor_ids: advising.map((a) => a.faculty_id),
    organization_ids: project_organizations.map((o) => o.organization_id),
    images: [...project_images].sort((a, b) => a.sort_order - b.sort_order)
      .map(({ storage_path, alt_text, caption }) => ({ storage_path, alt_text, caption })),
  };
}

export async function getInternship(id: string): Promise<Internship | null> {
  const { data, error } = await client().from("internships").select("id, company, term, description").eq("id", id)
    .maybeSingle<Internship>();
  if (error) throw error;
  return data;
}

// Photos ----------------------------------------------------------------------------------------

const MAX_SIDE = 2000;

// Shrinks a photo to 2000px on its long side and re-encodes it as JPEG. That keeps uploads under
// the 5 MB limit, saves the 1 GB of storage, and drops the camera's metadata (including GPS
// location) before anything leaves the student's device.
async function preparePhoto(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Couldn't read that photo. Use a JPEG, PNG or WebP file (export iPhone photos as JPEG).");
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#ffffff"; // transparent PNGs get a white background
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error("Couldn't prepare that photo. Try another file.");
  return blob;
}

// Uploads into the student's own folder: avatars/ for their profile photo, submissions/ for
// project photos. Returns the path to put in the submission.
export async function uploadPhoto(userId: string, folder: "avatars" | "submissions", file: File): Promise<string> {
  const blob = await preparePhoto(file);
  const path = `${folder}/${userId}/${crypto.randomUUID()}.jpg`;
  const { error } = await client().storage.from("media").upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  return path;
}

// Best effort: removes uploads that ended up unused because the submission failed.
export async function removeUploads(paths: string[]): Promise<void> {
  if (paths.length) await client().storage.from("media").remove(paths);
}

// Describing submissions -------------------------------------------------------------------------

export const STATUS_LABELS: Record<ChangeStatus, string> = {
  pending: "Waiting for review",
  changes_requested: "Changes requested",
  approved: "Approved",
  rejected: "Not approved",
  withdrawn: "Withdrawn",
};

// "New project: Campus Delivery Robot", "Profile changes", and so on. `titles` names the live
// projects and internships a submission changes, by id.
export function describeSubmission(s: Pick<Submission, "target_type" | "action" | "target_id" | "proposed_data">,
  titles: Record<string, string> = {}): string {
  const data = s.proposed_data as { title?: string; company?: string };
  const existing = (s.target_id && titles[s.target_id]) || "";
  switch (s.target_type) {
    case "profile":
      return { create: "Request to be added to the directory", update: "Profile changes", delete: "Remove me from the directory" }[s.action];
    case "project": {
      const title = data.title || existing || "a project";
      return { create: `New project: ${title}`, update: `Changes to ${existing || title}`, delete: `Remove project: ${existing || title}` }[s.action];
    }
    case "internship": {
      const company = data.company || existing || "an internship";
      return { create: `New internship: ${company}`, update: `Changes to internship: ${existing || company}`, delete: `Remove internship: ${existing || company}` }[s.action];
    }
  }
}
