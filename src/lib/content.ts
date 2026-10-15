import { FACULTY, PROJECTS, STUDENTS, SUB_DEPARTMENTS } from "./sample-data";
import type { Faculty, FacultyView, Project, ProjectView, Student, StudentView, SubDepartment } from "./types";

// The only file the pages read data from. It returns sample data for now. When the real schema
// is settled, replace the bodies below (src/lib/supabase.ts has a small REST helper) and keep
// the return types, and no page should need to change.

export const USING_SAMPLE_DATA = true;

const bySlug = <T extends { slug: string }>(items: T[]) => new Map(items.map((i) => [i.slug, i]));

function resolve(project: Project): ProjectView {
  const students = bySlug(STUDENTS);
  const faculty = bySlug(FACULTY);
  const departments = bySlug(SUB_DEPARTMENTS);
  return {
    ...project,
    sub_department: departments.get(project.sub_department) ?? { slug: project.sub_department, name: "Other" },
    // A student who is not in the (opted-in) list is never shown.
    members: project.members.flatMap((m) => {
      const student = students.get(m.student);
      return student ? [{ student, role: m.role }] : [];
    }),
    advisors: project.advisors.flatMap((slug) => faculty.get(slug) ?? []),
  };
}

// Pinned first, then higher priority, then most recently updated, then title, so the order
// never jumps around.
function compareProjects(a: Project, b: Project): number {
  return (
    Number(b.is_pinned) - Number(a.is_pinned) ||
    b.priority - a.priority ||
    b.date_updated.localeCompare(a.date_updated) ||
    a.title.localeCompare(b.title)
  );
}

export async function getProjects(): Promise<ProjectView[]> {
  return [...PROJECTS].sort(compareProjects).map(resolve);
}

export async function getProject(slug: string): Promise<ProjectView | null> {
  return (await getProjects()).find((p) => p.slug === slug) ?? null;
}

// Stand-in for the nightly pick (done by the back end). Pinned projects first, then priority.
export async function getCarouselProjects(max = 6): Promise<ProjectView[]> {
  return (await getProjects()).slice(0, max);
}

export async function getSubDepartments(): Promise<SubDepartment[]> {
  return SUB_DEPARTMENTS;
}

export async function getAllFaculty(): Promise<Faculty[]> {
  return [...FACULTY].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getFaculty(slug: string): Promise<FacultyView | null> {
  const person = FACULTY.find((f) => f.slug === slug);
  if (!person) return null;
  const projects = (await getProjects()).filter((p) => p.advisors.some((a) => a.slug === slug));
  return { ...person, projects };
}

export async function getStudents(): Promise<Student[]> {
  return [...STUDENTS].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getStudent(slug: string): Promise<StudentView | null> {
  const person = STUDENTS.find((s) => s.slug === slug);
  if (!person) return null;
  const projects = (await getProjects()).flatMap((project) => {
    const member = project.members.find((m) => m.student.slug === slug);
    return member ? [{ project, role: member.role }] : [];
  });
  return { ...person, projects };
}
