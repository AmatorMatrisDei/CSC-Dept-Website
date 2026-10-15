import type { Course, Degree, PlannerData } from "./types";

// The catalog data is large, so it loads only when someone opens the planner.
let cached: Promise<PlannerData> | undefined;

export function loadPlannerData(): Promise<PlannerData> {
  cached ??= Promise.all([import("@/data/planner/courses.json"), import("@/data/planner/degrees.json")]).then(
    ([courses, degrees]) => ({
      courses: new Map((courses.default as Course[]).map((c) => [c.id, c])),
      degrees: degrees.default as Degree[],
    }),
  );
  return cached;
}
