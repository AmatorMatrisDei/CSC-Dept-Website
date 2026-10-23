// What the verify-email and password-reset functions share: their secrets, the database calls
// behind account-email.ts, and answering browsers.
//
// Secrets (npx supabase secrets set NAME=value; docs/backend-setup.md):
//   FIREBASE_API_KEY      Firebase's web API key (Project settings > General). Not secret, but
//                         kept with the others so each project can use its own Firebase project.
//   FIREBASE_LINK_SECRET  A long random value. Never shown to anyone; see linkPassword().
//   ALLOWED_ORIGINS       Sites whose pages may call the functions, comma-separated. An entry
//                         like https://*.csc-dept-website.pages.dev allows that site's previews.
//   FIREBASE_API_URL      Optional, for testing against a stand-in for Firebase.
//   TURNSTILE_SECRET_KEY  password-reset only: the Cloudflare Turnstile widget's secret key. Until it
//                         is set there is no CAPTCHA check (see ../_shared/turnstile.ts).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Deps, Status, Store } from "./account-email.ts";
import { FIREBASE_API, firebase } from "./firebase.ts";

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "http://localhost:5173,http://127.0.0.1:5173")
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

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data as T;
}

// The helpers in migration *_account_verification.sql, which only the secret key can call.
const store: Store = {
  isVerified: (account) => rpc<boolean>("account_is_verified", { account }),
  allow: (account, kind) => rpc<boolean>("allow_verification_request", { account, request_kind: kind }),
  async latest(account, kind) {
    const at = await rpc<string | null>("latest_verification_request", { account, request_kind: kind });
    return at ? new Date(at) : null;
  },
  markVerified: (account) => rpc<void>("mark_account_verified", { account, how: "email" }),
  accountFor: (email) => rpc<string | null>("account_for_email", { address: email }),
  rememberFirebaseAccount: (account, firebaseId) => rpc<void>("remember_firebase_account", { account, uid: firebaseId }),
  firebaseAccount: (account) => rpc<string | null>("firebase_account_for", { account }),
  async setPassword(account, password) {
    const { error } = await db.auth.admin.updateUserById(account, { password });
    if (!error) return "ok";
    if (error.code === "weak_password") return "weak";
    throw error;
  },
  completeReset: (account) => rpc<void>("complete_password_reset", { account }),
};

export type Context = { deps: Deps; db: SupabaseClient; body: Record<string, unknown>; request: Request };

// Answers CORS preflights, reads the JSON body and turns the work's status into a reply:
// {"status": "..."}, with 503 for "unavailable" and 200 for everything else.
export function serve(name: string, work: (context: Context) => Promise<Status | Response>) {
  Deno.serve(async (request) => {
    const cors = corsHeaders(request.headers.get("Origin"));
    const reply = (status: string, code = 200) => Response.json({ status }, { status: code, headers: cors });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return reply("method_not_allowed", 405);

    const apiKey = Deno.env.get("FIREBASE_API_KEY");
    const secret = Deno.env.get("FIREBASE_LINK_SECRET");
    if (!apiKey || !secret) {
      console.error(`${name}: FIREBASE_API_KEY or FIREBASE_LINK_SECRET is not set`);
      return reply("unavailable", 503);
    }
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return reply("bad_request", 400);

    const deps: Deps = { firebase: firebase(apiKey, fetch, Deno.env.get("FIREBASE_API_URL") || FIREBASE_API), store, secret };
    try {
      const result = await work({ deps, db, body: body as Record<string, unknown>, request });
      if (result instanceof Response) {
        for (const [key, value] of Object.entries(cors)) result.headers.set(key, value);
        return result;
      }
      return reply(result, result === "unavailable" ? 503 : 200);
    } catch (error) {
      console.error(`${name}:`, error);
      return reply("unavailable", 503);
    }
  });
}

// An address as typed into a form, or null if it can't be one.
export function cleanEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+$/.test(email) ? email : null;
}
