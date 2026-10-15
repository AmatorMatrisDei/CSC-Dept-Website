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

// Calendar year of a semester, counting from the fall a student starts (index 0 is that fall).
const yearOf = (index: number, firstFall: number) => firstFall + Math.floor(index / 2) + (index % 2);

// Flags prerequisite groups nothing done or planned earlier meets, corequisites not planned in the
// same or an earlier semester, and courses placed in a term (or, given `firstFall`, a year) they
// aren't offered. Courses marked completed count as done. A group with `other` can be met outside
// the plan (high school math, placement), so it never warns; the catalog wording says how.
export function warnings(plan: Plan, courses: Map<string, Course>, completed: Set<string>, firstFall?: number): Warning[] {
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
      const parity = course.offered_years[term];
      if (firstFall && (parity === "odd" || parity === "even") && (yearOf(s, firstFall) % 2 === 1) !== (parity === "odd")) {
        found.push({ courseId: course.id, message: `Only offered in ${parity} years (${course.offered_text ?? parity})` });
      }
      for (const group of course.prerequisite_groups) {
        if (group.other) continue;
        const met = group.courses.some((p) => completed.has(p) || before.has(p) || (group.concurrent && now.has(p)));
        if (!met) found.push({ courseId: course.id, message: `Needs ${group.courses.map((p) => courses.get(p)?.code ?? p).join(" or ")} first` });
      }
      const alongside = course.corequisites.filter((p) => !completed.has(p) && !before.has(p) && !now.has(p));
      if (alongside.length) found.push({ courseId: course.id, message: `Take with ${alongside.map((p) => courses.get(p)?.code ?? p).join(", ")}` });
    }
  });
  return found;
}
