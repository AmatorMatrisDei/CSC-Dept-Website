// Picks the home-page carousel (FR-5.5 to FR-5.7).
//
//   POST {"action": "refresh"}    From the hourly schedule. Picks today's carousel (Eastern time)
//                                 unless it has been picked already. Authorization: Bearer
//                                 <CAROUSEL_CRON_SECRET>.
//   POST {"action": "reshuffle"}  From the admin panel's Re-shuffle button. Picks again now.
//                                 Authorization: Bearer <an admin's access token>.
//
// The pick is pickCarousel() in ../_shared/carousel-pick.ts, owned by the Algorithms team. Its
// seed is "<day>:<re-shuffle count>", so every pick can be reproduced.
import { createClient } from "npm:@supabase/supabase-js@2";
import { type Candidate, pickCarousel } from "../_shared/carousel-pick.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Returns the caller's id if the token belongs to an admin.
async function adminId(token: string): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();
  return profile?.role === "admin" ? data.user.id : null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "Use POST" });

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { action } = await req.json().catch(() => ({ action: undefined }));
  const cronSecret = Deno.env.get("CAROUSEL_CRON_SECRET");

  let reshuffledBy: string | null = null;
  if (action === "refresh") {
    if (!cronSecret || token !== cronSecret) return reply(401, { error: "Not allowed" });
  } else if (action === "reshuffle") {
    reshuffledBy = await adminId(token);
    if (!reshuffledBy) return reply(403, { error: "Only admins can re-shuffle the carousel" });
  } else {
    return reply(400, { error: 'action must be "refresh" or "reshuffle"' });
  }

  const { data: day, error: dayError } = await supabase.rpc("carousel_day");
  if (dayError) return reply(500, { error: dayError.message });

  const { data: state, error: stateError } = await supabase
    .from("carousel_state").select("reshuffles").eq("day", day).maybeSingle();
  if (stateError) return reply(500, { error: stateError.message });
  if (action === "refresh" && state) return reply(200, { day, skipped: "already picked today" });

  const { data: candidates, error: candidatesError } = await supabase.rpc("carousel_candidates", { for_day: day });
  if (candidatesError) return reply(500, { error: candidatesError.message });

  const seed = `${day}:${(state?.reshuffles ?? 0) + (reshuffledBy ? 1 : 0)}`;
  const projectIds = pickCarousel(candidates as Candidate[], seed);

  const { error: saveError } = await supabase.rpc("save_carousel", {
    for_day: day,
    project_ids: projectIds,
    reshuffled_by: reshuffledBy,
  });
  if (saveError) return reply(500, { error: saveError.message });

  return reply(200, { day, seed, project_ids: projectIds });
});
