// Shapes the pages use. Names follow the Requirements Guide (Section 3), not the current
// Supabase schema, which does not match yet (see NOTES-to-flag-to-others.md). When real data
// is connected, only src/lib/content.ts should need to change.

export const STATUSES = ["Active", "Planned", "Completed"] as const;
export type Status = (typeof STATUSES)[number];

export const CATEGORY_LABELS = {
  current: "Current Student / Personal",
  capstone: "Capstone",
  class: "Class",
  internship: "Internships",
  alumni: "Alumni Stories",
  partner: "Collaborating Organizations",
} as const;
export type Category = keyof typeof CATEGORY_LABELS;

export type SubDepartment = { slug: string; name: string };

export type Photo = { url: string; alt: string };

export type Faculty = {
  slug: string;
  name: string;
  title: string;
  email: string;
  photo: Photo | null;
};

// Only students who opted in are ever returned by the data layer.
export type Student = {
  slug: string;
  name: string;
  email: string;
  photo: Photo | null;
  linkedin_url: string | null;
  major: "CSC" | "EGR";
  class_year: number;
  background: string;
  skills: string[];
  clubs_roles: string[];
};

export type Project = {
  slug: string;
  title: string;
  summary: string; // short text for cards (not in the guide yet: ask Data Structures)
  description: string;
  category: Category;
  status: Status;
  sub_department: string; // SubDepartment.slug
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
  partner_type: "Grant" | "Organization" | null;
  members: { student: string; role: string }[]; // Student.slug
  advisors: string[]; // Faculty.slug
};

// A project with its people and department looked up, ready to display.
export type ProjectView = Omit<Project, "members" | "advisors" | "sub_department"> & {
  sub_department: SubDepartment;
  members: { student: Student; role: string }[];
  advisors: Faculty[];
};

export type FacultyView = Faculty & { projects: ProjectView[] };
export type StudentView = Student & { projects: { project: ProjectView; role: string }[] };
