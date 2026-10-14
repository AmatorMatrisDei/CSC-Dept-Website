// Picks the home-page carousel (FR-5.5 to FR-5.7).
//
//   POST {"action": "refresh"}    From the hourly schedule. Picks today's carousel (Eastern time)
//                                 unless it has been picked already. Authorization: Bearer
//                                 <CAROUSEL_CRON_SECRET>.
//   POST {"action": "reshuffle"}  From the admin panel's Re-shuffle button. Picks again now.
//                                 Authorization: Bearer <an admin's access token>.
//
// Browsers may only call it from the sites listed in CAROUSEL_ALLOWED_ORIGINS (comma-separated;
// an entry like https://*.csc-dept-website.pages.dev allows that site's preview subdomains).
//
// The pick is pickCarousel() in ../_shared/carousel-pick.ts, owned by the Algorithms team. Its
// seed is "<day>:<re-shuffle count>", so every pick can be reproduced.
import { createClient } from "npm:@supabase/supabase-js@2";
import { type Candidate, pickCarousel } from "../_shared/carousel-pick.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const allowedOrigins = (Deno.env.get("CAROUSEL_ALLOWED_ORIGINS") ?? "http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function isAllowedOrigin(origin: string): boolean {
  return allowedOrigins.some((allowed) => {
    const wildcard = allowed.match(/^(https?:\/\/)\*\.(.+)$/);
    if (!wildcard) return origin === allowed;
    const [, scheme, domain] = wildcard;
    return origin.startsWith(scheme) && origin.slice(scheme.length).endsWith(`.${domain}`);
  });
}

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !isAllowedOrigin(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

// Compares secrets without leaking how many leading characters matched through timing.
function secretsMatch(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
}

// Returns the caller's id if the token belongs to an admin.
async function adminId(token: string): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();
  return profile?.role === "admin" ? data.user.id : null;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const cors = corsHeaders(origin);
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  // Database details go to the function's logs, not to the caller.
  const failed = (step: string, error: { message: string }) => {
    console.error(`carousel: ${step} failed: ${error.message}`);
    return reply(500, { error: "The carousel could not be updated" });
  };

  if (origin && !isAllowedOrigin(origin)) return reply(403, { error: "Origin not allowed" });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply(405, { error: "Use POST" });

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { action } = await req.json().catch(() => ({ action: undefined }));
  const cronSecret = Deno.env.get("CAROUSEL_CRON_SECRET");

  let reshuffledBy: string | null = null;
  if (action === "refresh") {
    if (!cronSecret || !secretsMatch(token, cronSecret)) return reply(401, { error: "Not allowed" });
  } else if (action === "reshuffle") {
    reshuffledBy = await adminId(token);
    if (!reshuffledBy) return reply(403, { error: "Only admins can re-shuffle the carousel" });
  } else {
    return reply(400, { error: 'action must be "refresh" or "reshuffle"' });
  }

  const { data: day, error: dayError } = await supabase.rpc("carousel_day");
  if (dayError) return failed("reading the day", dayError);

  const { data: state, error: stateError } = await supabase
    .from("carousel_state").select("reshuffles").eq("day", day).maybeSingle();
  if (stateError) return failed("reading today's state", stateError);
  if (action === "refresh" && state) return reply(200, { day, skipped: "already picked today" });

  const { data: candidates, error: candidatesError } = await supabase.rpc("carousel_candidates", { for_day: day });
  if (candidatesError) return failed("reading candidates", candidatesError);

  const seed = `${day}:${(state?.reshuffles ?? 0) + (reshuffledBy ? 1 : 0)}`;
  const projectIds = pickCarousel(candidates as Candidate[], seed);

  const { error: saveError } = await supabase.rpc("save_carousel", {
    for_day: day,
    project_ids: projectIds,
    reshuffled_by: reshuffledBy,
  });
  if (saveError) return failed("saving the pick", saveError);

  return reply(200, { day, seed, project_ids: projectIds });
});
