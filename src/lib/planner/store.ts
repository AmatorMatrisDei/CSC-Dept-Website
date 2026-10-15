import { supabase } from "@/lib/supabase";
import type { Json } from "@/lib/database.types";
import type { Plan } from "./types";

// What a signed-in person's planner remembers: their major, which view they were on, the courses
// they have finished, and their own plan for each major. One row per person in planner_plans, and
// the database only lets people read and write their own. Signed-out visitors save nothing.

export type PlannerState = {
  degree: string | null;
  mode: "suggested" | "mine";
  completed: string[];
  plans: Record<string, Plan>;
};

export const emptyState = (): PlannerState => ({ degree: null, mode: "suggested", completed: [], plans: {} });

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function getPlannerState(userId: string): Promise<PlannerState> {
  const { data, error } = await client().from("planner_plans").select("state").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  const saved = (data?.state ?? {}) as Partial<PlannerState>;
  return {
    degree: typeof saved.degree === "string" ? saved.degree : null,
    mode: saved.mode === "mine" ? "mine" : "suggested",
    completed: Array.isArray(saved.completed) ? saved.completed : [],
    plans: saved.plans && typeof saved.plans === "object" ? saved.plans : {},
  };
}

export async function savePlannerState(userId: string, state: PlannerState): Promise<string | null> {
  const { error } = await client()
    .from("planner_plans")
    .upsert({ user_id: userId, state: state as unknown as Json });
  return error ? error.message : null;
}
