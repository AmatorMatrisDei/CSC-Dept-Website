import { supabase } from "@/lib/supabase";
import type { Json } from "@/lib/database.types";
import type { Plan } from "./types";

// What a signed-in person's planner remembers: the catalog year they started in, their program
// and minor, which view they were on, the courses they have finished, and their own plan for each
// program. One row per person in planner_plans, and the database only lets people read and write
// their own. Signed-out visitors save nothing.

export type PlannerState = {
  catalog: string | null; // the catalog year they started in, such as "2024-2025"
  degree: string | null;
  minor: string | null;
  mode: "suggested" | "mine";
  completed: string[];
  plans: Record<string, Plan>; // keyed by planKey(catalog, program)
};

export const emptyState = (): PlannerState => ({ catalog: null, degree: null, minor: null, mode: "suggested", completed: [], plans: {} });

// A plan belongs to one program in one catalog year.
export const planKey = (catalog: string, degree: string) => `${catalog}/${degree}`;

// Plans saved before catalog years were all made with the 2025-2026 catalog.
const LEGACY_CATALOG = "2025-2026";

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function getPlannerState(userId: string): Promise<PlannerState> {
  const { data, error } = await client().from("planner_plans").select("state").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  const saved = (data?.state ?? {}) as Partial<PlannerState>;
  const plans = saved.plans && typeof saved.plans === "object" ? saved.plans : {};
  const legacy = Object.keys(plans).some((key) => !key.includes("/"));
  return {
    catalog: typeof saved.catalog === "string" ? saved.catalog : legacy ? LEGACY_CATALOG : null,
    degree: typeof saved.degree === "string" ? saved.degree : null,
    minor: typeof saved.minor === "string" ? saved.minor : null,
    mode: saved.mode === "mine" ? "mine" : "suggested",
    completed: Array.isArray(saved.completed) ? saved.completed : [],
    plans: Object.fromEntries(Object.entries(plans).map(([key, plan]) => [key.includes("/") ? key : planKey(LEGACY_CATALOG, key), plan])),
  };
}

export async function savePlannerState(userId: string, state: PlannerState): Promise<string | null> {
  const { error } = await client()
    .from("planner_plans")
    .upsert({ user_id: userId, state: state as unknown as Json });
  return error ? error.message : null;
}
