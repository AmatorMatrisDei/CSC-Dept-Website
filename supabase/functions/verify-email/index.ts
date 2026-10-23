// Verifies a signed-in person's email address with a link that Google Firebase emails them. How
// it works, and what each answer means: ../_shared/account-email.ts.
//
//   POST {"action": "send"}   Emails a new verification link (the last one stops working).
//   POST {"action": "check"}  After they click it: marks the account verified.
//
// Authorization: Bearer <the person's access token>. Answers {"status": "..."}. Secrets:
// ../_shared/account-email-setup.ts.
import { checkVerification, sendVerification } from "../_shared/account-email.ts";
import { serve } from "../_shared/account-email-setup.ts";

serve("verify-email", async ({ deps, db, body, request }) => {
  const token = request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
  const { data } = await db.auth.getUser(token);
  const user = data.user?.email ? { id: data.user.id, email: data.user.email.toLowerCase() } : null;
  if (!user) return Response.json({ status: "signed_out" }, { status: 401 });

  if (body.action === "send") return sendVerification(deps, user);
  if (body.action === "check") return checkVerification(deps, user);
  return Response.json({ status: "bad_request" }, { status: 400 });
});
