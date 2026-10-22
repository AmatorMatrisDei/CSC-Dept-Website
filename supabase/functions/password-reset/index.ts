// Resets a forgotten password with a link that Google Firebase emails, for people who can't sign
// in. How it works, and what each answer means: ../_shared/account-email.ts.
//
//   POST {"action": "send", "email": "...", "captcha": "..."}       Emails a link to choose a new password.
//   POST {"action": "finish", "email": "...", "password": "...",    With the password chosen through that
//         "captcha": "..."}                                         link: makes it the site password.
//
// No sign-in needed, so each request also carries a Cloudflare Turnstile token ("captcha"), checked
// with TURNSTILE_SECRET_KEY (../_shared/turnstile.ts). Answers {"status": "..."}; "captcha_failed"
// when the token doesn't pass. Secrets: ../_shared/account-email-setup.ts.
import { finishReset, sendReset } from "../_shared/account-email.ts";
import { cleanEmail, serve } from "../_shared/account-email-setup.ts";
import { callerIp, passesTurnstile } from "../_shared/turnstile.ts";

serve("password-reset", async ({ deps, body, request }) => {
  const email = cleanEmail(body.email);
  if (!email) return Response.json({ status: "bad_request" }, { status: 400 });
  if (!(await passesTurnstile(Deno.env.get("TURNSTILE_SECRET_KEY"), body.captcha, callerIp(request.headers)))) {
    return "captcha_failed";
  }

  if (body.action === "send") return sendReset(deps, email);
  if (body.action === "finish" && typeof body.password === "string" && body.password.length <= 200) {
    return finishReset(deps, email, body.password);
  }
  return Response.json({ status: "bad_request" }, { status: 400 });
});
