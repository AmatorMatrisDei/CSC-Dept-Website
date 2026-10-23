import { supabase } from "./supabase";
import type { Role } from "./account";

// Admin-only: everyone with an account, and changing their role. The database is what enforces
// this (only admins can read unlisted profiles or change a role, each change is logged, and only
// verified accounts can become reviewers or admins).

export type Person = { id: string; name: string; role: Role; email: string; verified: boolean };

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function getPeople(version = 0): Promise<Person[]> {
  void version;
  const { data, error } = await client().rpc("list_people");
  if (error) throw error;
  return data;
}

export async function setRole(id: string, role: Role): Promise<void> {
  const { data, error } = await client().from("profiles").update({ role }).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("You may not have permission to change roles.");
}
