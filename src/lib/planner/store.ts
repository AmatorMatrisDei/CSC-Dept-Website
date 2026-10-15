import type { Plan } from "./types";

// What the planner remembers, kept in this browser only (there is no sign-in for it yet, so a plan
// does not follow a student to another device). Every read and write is guarded: storage can be
// blocked or full, and the planner works without it.

const PREFIX = "planner:";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage unavailable; the plan just will not be remembered.
  }
}

export const loadDegreeId = () => read<string | null>("degree", null);
export const saveDegreeId = (id: string) => write("degree", id);

export const loadCompleted = () => new Set(read<string[]>("completed", []));
export const saveCompleted = (ids: Set<string>) => write("completed", [...ids]);

export const loadMyPlan = (degreeId: string, valid: (plan: Plan) => boolean): Plan | null => {
  const plan = read<Plan | null>(`plan:${degreeId}`, null);
  return plan && valid(plan) ? plan : null;
};
export const saveMyPlan = (degreeId: string, plan: Plan) => write(`plan:${degreeId}`, plan);
export const clearMyPlan = (degreeId: string) => {
  try {
    localStorage.removeItem(`${PREFIX}plan:${degreeId}`);
  } catch {
    // ignore
  }
};
