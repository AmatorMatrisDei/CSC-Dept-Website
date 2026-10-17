// Shapes the pages use. Only src/lib/content.ts knows how they map to the Supabase tables.

// The database stores lowercase statuses; content.ts capitalizes them for display and URLs.
export const STATUSES = ["Active", "Planned", "Completed"] as const;
export type Status = (typeof STATUSES)[number];

// Keys are the `categories.slug` values in the database. Internships and alumni stories are
// separate tables, not project categories, so they are not listed here.
export const CATEGORY_LABELS = {
  personal: "Current Student / Personal",
  capstone: "Capstone",
  class: "Class",
  partner: "Collaborating Organizations",
} as const;
export type Category = keyof typeof CATEGORY_LABELS;

export type SubDepartment = { slug: string; name: string };

// `caption` is shown under project gallery photos when there is one.
export type Photo = { url: string; alt: string; caption?: string };

// `slug` is the row id for faculty and students until the database has real slugs.
export type Faculty = {
  slug: string;
  name: string;
  title: string;
  email: string | null;
  photo: Photo | null;
};

// Only students who opted in are ever returned by the database (row level security).
export type Student = {
  slug: string;
  name: string;
  headline: string;
  email: string | null; // present only if the student consented to showing it
  phone: string | null; // likewise
  photo: Photo | null;
  linkedin_url: string | null;
  github_url: string | null;
  website_url: string | null;
  major: string | null;
  class_year: number | null;
  background: string;
  skills: string[];
  clubs_roles: string[];
};

// `slug` is null for people who are not students in the directory (outside mentors, etc.).
export type Member = { name: string; slug: string | null; role: string };

export type ProjectView = {
  slug: string;
  title: string;
  summary: string;
  description: string;
  category: Category;
  status: Status;
  sub_department: SubDepartment;
  date_started: string | null;
  date_finished: string | null;
  date_updated: string;
  priority: number;
  is_pinned: boolean;
  thumbnail: Photo | null;
  images: Photo[];
  links: { label: string; url: string }[];
  contact_email: string | null;
  contact_phone: string | null;
  open_to_contributors: boolean;
  members: Member[];
  advisors: Faculty[];
};

export type FacultyView = Faculty & { projects: ProjectView[] };
export type StudentView = Student & { projects: { project: ProjectView; role: string }[] };
