// Checks a Cloudflare Turnstile token: proof that a person, not a program, filled in the form
// (https://developers.cloudflare.com/turnstile/get-started/server-side-validation/). Each token
// works once and for five minutes.
//
// With no secret set, the project has no CAPTCHA yet and every request passes, so the functions
// work before Turnstile is set up (and locally). Production must set TURNSTILE_SECRET_KEY.

export const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function passesTurnstile(
  secret: string | undefined,
  token: unknown,
  ip: string | null,
  send: typeof fetch = fetch,
): Promise<boolean> {
  if (!secret) return true;
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  const form = new URLSearchParams({ secret, response: token });
  if (ip) form.set("remoteip", ip);
  try {
    const response = await send(SITEVERIFY, { method: "POST", body: form });
    const result: unknown = await response.json();
    return (result as { success?: unknown })?.success === true;
  } catch {
    return false; // if Cloudflare can't be asked, don't let the request through
  }
}

// The caller's address, as Supabase passes it on, for Cloudflare's check.
export function callerIp(headers: Headers): string | null {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}
