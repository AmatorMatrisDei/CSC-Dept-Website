import type { Course, Degree, Plan, PlanItem, Requirement } from "./types";

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

// "Year 1, Fall", or "Year 1, Fall 2025" given the fall the student started.
export const semesterLabel = (index: number, firstFall?: number) =>
  `Year ${Math.floor(index / 2) + 1}, ${index % 2 === 0 ? "Fall" : "Spring"}${firstFall ? ` ${yearOf(index, firstFall)}` : ""}`;

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
function yearOf(index: number, firstFall: number) {
  return firstFall + Math.floor(index / 2) + (index % 2);
}

// Where a program requirement stands against a plan: met by courses completed, met by courses in
// the plan, not met yet, or open (an elective or core area the planner can't check).
export type RequirementStatus = { requirement: Requirement; status: "completed" | "planned" | "missing" | "open"; courses: string[] };

// Each course counts toward one requirement only, so "two cybersecurity electives" need two
// different courses. Requirements with a single option (a required course) claim their courses
// first, so an elective never takes a course the program requires outright.
export function checkRequirements(requirements: Requirement[], planned: Set<string>, completed: Set<string>): RequirementStatus[] {
  const used = new Set<string>();
  const result: RequirementStatus[] = new Array(requirements.length);
  const order = requirements.map((_, i) => i).sort((a, b) => Number((requirements[a].options?.length ?? 0) > 1) - Number((requirements[b].options?.length ?? 0) > 1));
  for (const i of order) {
    const requirement = requirements[i];
    if (!requirement.options?.length) {
      result[i] = { requirement, status: "open", courses: [] };
      continue;
    }
    const free = (ids: string[]) => ids.every((id) => !used.has(id));
    const done = requirement.options.find((o) => free(o) && o.every((id) => completed.has(id)));
    const inPlan = done ?? requirement.options.find((o) => free(o) && o.every((id) => completed.has(id) || planned.has(id)));
    if (inPlan) inPlan.forEach((id) => used.add(id));
    result[i] = inPlan ? { requirement, status: done ? "completed" : "planned", courses: inPlan } : { requirement, status: "missing", courses: [] };
  }
  return result;
}

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
