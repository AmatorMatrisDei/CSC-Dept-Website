import type { Course, Degree, Plan, PlanItem } from "./types";

// Pure rules for the planner: building a plan, changing it, and checking it. No React in here.

export const MAX_CREDITS = 18;

export function suggestedPlan(degree: Degree): Plan {
  return degree.semesters.map((semester, s) =>
    semester.entries.map((entry, i): PlanItem =>
      "course" in entry
        ? { key: `s${s}-${i}`, course: entry.course, slot: null, credits: 0 }
        : { key: `s${s}-${i}`, course: null, slot: entry.slot, credits: entry.credits },
    ),
  );
}

export const itemCredits = (item: PlanItem, courses: Map<string, Course>) =>
  item.course ? (courses.get(item.course)?.credits ?? 3) : item.credits;

export const semesterCredits = (items: PlanItem[], courses: Map<string, Course>) =>
  items.reduce((sum, item) => sum + itemCredits(item, courses), 0);

export const semesterLabel = (index: number) => `Year ${Math.floor(index / 2) + 1}, ${index % 2 === 0 ? "Fall" : "Spring"}`;

export function moveItem(plan: Plan, key: string, to: number): Plan {
  const item = plan.flat().find((i) => i.key === key);
  if (!item) return plan;
  return plan.map((items, s) => (s === to ? [...items.filter((i) => i.key !== key), item] : items.filter((i) => i.key !== key)));
}

export const removeItem = (plan: Plan, key: string): Plan => plan.map((items) => items.filter((i) => i.key !== key));

export function addCourse(plan: Plan, courseId: string, to: number): Plan {
  if (plan.flat().some((i) => i.course === courseId)) return plan;
  const item: PlanItem = { key: `c-${courseId}-${Date.now()}`, course: courseId, slot: null, credits: 0 };
  return plan.map((items, s) => (s === to ? [...items, item] : items));
}

export type Warning = { courseId: string; message: string };

// Flags courses whose prerequisites are not done or planned earlier, and corequisites that are not
// planned in the same or an earlier semester. Courses marked completed count as done.
export function warnings(plan: Plan, courses: Map<string, Course>, completed: Set<string>): Warning[] {
  const found: Warning[] = [];
  plan.forEach((items, s) => {
    const before = new Set(plan.slice(0, s).flatMap((x) => x.flatMap((i) => (i.course ? [i.course] : []))));
    const now = new Set(items.flatMap((i) => (i.course ? [i.course] : [])));
    for (const item of items) {
      const course = item.course ? courses.get(item.course) : undefined;
      if (!course) continue;
      const term = s % 2 === 0 ? "fall" : "spring";
      if (course.offered.length && !course.offered.includes(term)) {
        found.push({ courseId: course.id, message: `Only offered in ${course.offered.map((t) => t[0].toUpperCase() + t.slice(1)).join(" and ")}` });
      }
      const need = course.prerequisites.filter((p) => !completed.has(p) && !before.has(p));
      if (need.length) found.push({ courseId: course.id, message: `Needs ${need.map((p) => courses.get(p)?.code ?? p).join(", ")} first` });
      const alongside = course.corequisites.filter((p) => !completed.has(p) && !before.has(p) && !now.has(p));
      if (alongside.length) found.push({ courseId: course.id, message: `Take with ${alongside.map((p) => courses.get(p)?.code ?? p).join(", ")}` });
    }
  });
  return found;
}
