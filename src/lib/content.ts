import { mediaUrl, supabase } from "./supabase";
import type {
  Category,
  Faculty,
  FacultyView,
  Photo,
  ProjectView,
  Status,
  Student,
  StudentView,
  SubDepartment,
} from "./types";

// The only file the public pages read data from; the signed-in pages use account.ts and
// review.ts. It reads the public (published, opted-in) rows from Supabase. People come from the
// listed_students view, never from profiles, so unlisted students never show even to a signed-in
// reviewer.

type FacultyRow = { slug: string; name: string; title: string; email: string | null; photo_path: string | null };
type ProfileRow = {
  slug: string;
  name: string;
  headline: string;
  contact_email: string | null;
  contact_phone: string | null;
  photo_path: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  website_url: string | null;
  major: string | null;
  class_year: number | null;
  background: string;
  skills: string[];
  clubs_roles: string[];
};
type ProjectRow = {
  slug: string;
  title: string;
  summary: string;
  description: string;
  status: "planned" | "active" | "completed";
  priority: number;
  is_pinned: boolean;
  open_to_contributors: boolean;
  date_started: string | null;
  date_finished: string | null;
  updated_at: string;
  thumbnail_path: string | null;
  thumbnail_alt: string | null;
  poster_url: string | null;
  repo_url: string | null;
  demo_url: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  sub_departments: SubDepartment;
  categories: { slug: string };
  project_images: { storage_path: string; alt_text: string; sort_order: number }[];
  contributions: {
    role: string;
    external_name: string | null;
    sort_order: number;
    listed_students: { slug: string; name: string } | null;
  }[];
  advising: { faculty: FacultyRow }[];
};

const PROJECT_SELECT = `
  slug, title, summary, description, status, priority, is_pinned, open_to_contributors,
  date_started, date_finished, updated_at, thumbnail_path, thumbnail_alt, poster_url, repo_url, demo_url,
  primary_contact_email, primary_contact_phone,
  sub_departments(slug, name), categories(slug),
  project_images(storage_path, alt_text, sort_order),
  contributions(role, external_name, sort_order, listed_students(slug, name)),
  advising(faculty(slug, name, title, email, photo_path))`;

const PROFILE_SELECT =
  "slug, name, headline, contact_email, contact_phone, photo_path, linkedin_url, github_url, website_url, major, class_year, background, skills, clubs_roles";

function client() {
  if (!supabase) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local.");
  }
  return supabase;
}

function photo(path: string | null, alt: string): Photo | null {
  const url = mediaUrl(path);
  return url ? { url, alt } : null;
}

function toFaculty(row: FacultyRow): Faculty {
  return {
    slug: row.slug,
    name: row.name,
    title: row.title,
    email: row.email,
    photo: photo(row.photo_path, row.name),
  };
}

function toStudent(row: ProfileRow): Student {
  return {
    slug: row.slug,
    name: row.name,
    headline: row.headline,
    email: row.contact_email,
    phone: row.contact_phone,
    photo: photo(row.photo_path, row.name),
    linkedin_url: row.linkedin_url,
    github_url: row.github_url,
    website_url: row.website_url,
    major: row.major,
    class_year: row.class_year,
    background: row.background,
    skills: row.skills,
    clubs_roles: row.clubs_roles,
  };
}

function toProject(row: ProjectRow): ProjectView {
  const links = [
    { label: "Source code", url: row.repo_url },
    { label: "Live demo", url: row.demo_url },
    { label: "Poster", url: row.poster_url },
  ].flatMap((l) => (l.url ? [{ label: l.label, url: l.url }] : []));

  return {
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    description: row.description,
    category: row.categories.slug as Category,
    status: (row.status.charAt(0).toUpperCase() + row.status.slice(1)) as Status,
    sub_department: row.sub_departments,
    date_started: row.date_started,
    date_finished: row.date_finished,
    date_updated: row.updated_at,
    priority: row.priority,
    is_pinned: row.is_pinned,
    thumbnail: photo(row.thumbnail_path, row.thumbnail_alt ?? ""),
    images: [...row.project_images]
      .sort((a, b) => a.sort_order - b.sort_order)
      .flatMap((i) => photo(i.storage_path, i.alt_text) ?? []),
    links,
    contact_email: row.primary_contact_email,
    contact_phone: row.primary_contact_phone,
    open_to_contributors: row.open_to_contributors,
    members: [...row.contributions]
      .sort((a, b) => a.sort_order - b.sort_order)
      .flatMap((c) => {
        // listed_students only has students who are approved and consenting, so anyone else is
        // shown only if the project names them by hand (external_name).
        const name = c.listed_students?.name ?? c.external_name;
        return name ? [{ name, slug: c.listed_students?.slug ?? null, role: c.role }] : [];
      }),
    advisors: row.advising.map((a) => toFaculty(a.faculty)),
  };
}

// Pinned first, then higher priority, then most recently updated, then title, so the order
// never jumps around.
function compareProjects(a: ProjectView, b: ProjectView): number {
  return (
    Number(b.is_pinned) - Number(a.is_pinned) ||
    b.priority - a.priority ||
    b.date_updated.localeCompare(a.date_updated) ||
    a.title.localeCompare(b.title)
  );
}

async function fetchProjects(): Promise<ProjectView[]> {
  // Row level security already hides unpublished work from visitors; filtering here keeps it
  // hidden from signed-in people too, so public pages show the public view.
  const { data, error } = await client()
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("published", true)
    .eq("contributions.confirmed", true)
    .returns<ProjectRow[]>();
  if (error) throw error;
  return data.map(toProject).sort(compareProjects);
}

// Several parts of a page ask for the same lists, so share one request per page load.
let projectsRequest: Promise<ProjectView[]> | null = null;
export function getProjects(): Promise<ProjectView[]> {
  projectsRequest ??= fetchProjects().catch((e) => {
    projectsRequest = null;
    throw e;
  });
  return projectsRequest;
}

// After a reviewer approves a change, the next page reads fresh data instead of this page load's copy.
export function forgetCachedContent() {
  projectsRequest = null;
}

// Staff edit (admin only; the database rejects anyone else). Clears the shared cache so the next
// read shows the change.
export async function saveProject(
  slug: string,
  patch: Partial<{
    title: string;
    summary: string;
    description: string;
    primary_contact_email: string | null;
    primary_contact_phone: string | null;
    repo_url: string | null;
    demo_url: string | null;
    poster_url: string | null;
    thumbnail_alt: string | null;
  }>,
): Promise<string | null> {
  const error = await saveRow("projects", slug, patch);
  if (!error) projectsRequest = null;
  return error;
}

// Staff edits to a student's page (admin only; the database rejects anyone else).
export function saveStudent(
  slug: string,
  patch: Partial<{
    name: string;
    headline: string;
    background: string;
    major: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    linkedin_url: string | null;
    github_url: string | null;
    website_url: string | null;
    skills: string[];
    clubs_roles: string[];
  }>,
) {
  return saveRow("profiles", slug, patch);
}

export function saveFaculty(slug: string, patch: Partial<{ name: string; title: string; email: string | null }>) {
  return saveRow("faculty", slug, patch);
}

async function saveRow(table: "projects" | "profiles" | "faculty", slug: string, patch: Record<string, unknown>) {
  const { data, error } = await client().from(table).update(patch).eq("slug", slug).select("slug");
  if (error) return "Could not save: " + error.message;
  if (!data?.length) return "Could not save: you may not have permission.";
  return null;
}

export async function getProject(slug: string): Promise<ProjectView | null> {
  return (await getProjects()).find((p) => p.slug === slug) ?? null;
}

// Today's pick, saved by the back end's hourly job (carousel_today view). If it has not run
// yet, fall back to the top of the normal ordering.
// Shows the daily pick as chosen (it can be 7 projects, FR-5.1). Only the fallback, used when no
// pick exists yet, is limited to `fallbackMax`.
export async function getCarouselProjects(fallbackMax = 6): Promise<ProjectView[]> {
  const [projects, { data, error }] = await Promise.all([
    getProjects(),
    client().from("carousel_today").select("slug, position").order("position").returns<{ slug: string; position: number }[]>(),
  ]);
  if (error) throw error;
  const picked = data.flatMap((row) => projects.find((p) => p.slug === row.slug) ?? []);
  return picked.length ? picked : projects.slice(0, fallbackMax);
}

export async function getSubDepartments(): Promise<SubDepartment[]> {
  const { data, error } = await client()
    .from("sub_departments")
    .select("slug, name")
    .order("sort_order")
    .returns<SubDepartment[]>();
  if (error) throw error;
  return data;
}

export async function getAllFaculty(): Promise<Faculty[]> {
  const { data, error } = await client()
    .from("faculty")
    .select("slug, name, title, email, photo_path")
    .order("name")
    .returns<FacultyRow[]>();
  if (error) throw error;
  return data.map(toFaculty);
}

export async function getFaculty(slug: string): Promise<FacultyView | null> {
  const person = (await getAllFaculty()).find((f) => f.slug === slug);
  if (!person) return null;
  const projects = (await getProjects()).filter((p) => p.advisors.some((a) => a.slug === slug));
  return { ...person, projects };
}

export async function getStudents(): Promise<Student[]> {
  const { data, error } = await client()
    .from("listed_students")
    .select(PROFILE_SELECT)
    .order("name")
    .returns<ProfileRow[]>();
  if (error) throw error;
  return data.map(toStudent);
}

export async function getStudent(slug: string): Promise<StudentView | null> {
  const person = (await getStudents()).find((s) => s.slug === slug);
  if (!person) return null;
  const projects = (await getProjects()).flatMap((project) => {
    const member = project.members.find((m) => m.slug === slug);
    return member ? [{ project, role: member.role }] : [];
  });
  return { ...person, projects };
}
