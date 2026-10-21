// Resets a forgotten password with a link that Google Firebase emails, for people who can't sign
// in. How it works, and what each answer means: ../_shared/account-email.ts.
//
//   POST {"action": "send", "email": "..."}                     Emails a link to choose a new password.
//   POST {"action": "finish", "email": "...", "password": "..."} With the password chosen through that
//                                                               link: makes it the site password.
//
// No sign-in needed. Answers {"status": "..."}. Secrets: ../_shared/account-email-setup.ts.
import { finishReset, sendReset } from "../_shared/account-email.ts";
import { cleanEmail, serve } from "../_shared/account-email-setup.ts";

serve("password-reset", async ({ deps, body }) => {
  const email = cleanEmail(body.email);
  if (!email) return Response.json({ status: "bad_request" }, { status: 400 });

  if (body.action === "send") return sendReset(deps, email);
  if (body.action === "finish" && typeof body.password === "string" && body.password.length <= 200) {
    return finishReset(deps, email, body.password);
  }
  return Response.json({ status: "bad_request" }, { status: 400 });
});
