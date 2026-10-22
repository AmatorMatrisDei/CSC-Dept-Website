// How the verify-email and password-reset functions use Firebase to prove that someone reads an
// account's inbox. Supabase can't send these emails itself (its built-in mailer only reaches the
// project's team), and Firebase's free plan sends 1,000 verification and 150 reset emails a day.
//
// Each email gets a brand-new Firebase account for the address, with a password only our
// functions know (linkPassword). Firebase can only mark that account verified, or give it a new
// password, through the link it sends to the inbox. So:
//
//   Verify  send:   new Firebase account; Firebase emails a verification link.
//           check:  sign in with our password; if Firebase says verified, so is the Supabase account.
//   Reset   send:   new Firebase account; Firebase emails a link to choose a new password.
//           finish: the person types the password they chose. If it signs in to the Firebase
//                   account we made, they used the link, so it becomes their Supabase password too.
//
// Making the account new each time means an old click can't count. We remember which Firebase
// account we made last, so one that someone made for the address outside our functions (the API
// key is public) never counts; we can't use or remove such an account, so the person is told to
// contact the team ("address_in_use"). That also happens if someone chose a new password through
// a reset email and never finished here: finishing the reset clears it. Once a link has done its
// job, the Firebase account is deleted.
//
// Everything outside (Firebase, the database, the clock) is passed in, so the tests can fake it.
import { type Firebase, linkPassword, type Session, WRONG_CREDENTIALS } from "./firebase.ts";

export type Status =
  | "sent" // an email is on its way
  | "verified" // the account is verified (now or already)
  | "not_yet" // the verification link hasn't been clicked
  | "send_first" // check without a recent verification email
  | "wrong_password" // finish: that isn't a password chosen through our reset email
  | "weak_password" // finish: Supabase refused the password; ask for a new email
  | "done" // finish: the new password works on the site
  | "wait" // asked too often; try again later
  | "address_in_use" // a Firebase account we can't use blocks this address
  | "unavailable"; // Firebase or the database failed

export type RequestKind = "verify_send" | "verify_check" | "reset_send" | "reset_finish";

export type Store = {
  isVerified(account: string): Promise<boolean>;
  // Records a request and returns true, or returns false when the account asked too often.
  allow(account: string, kind: RequestKind): Promise<boolean>;
  latest(account: string, kind: RequestKind): Promise<Date | null>;
  markVerified(account: string): Promise<void>;
  accountFor(email: string): Promise<string | null>;
  rememberFirebaseAccount(account: string, firebaseId: string): Promise<void>;
  firebaseAccount(account: string): Promise<string | null>;
  // "weak" when Supabase's password rules refuse it.
  setPassword(account: string, password: string): Promise<"ok" | "weak">;
  // Verifies the account and ends its other sessions.
  completeReset(account: string): Promise<void>;
};

export type Deps = { firebase: Firebase; store: Store; secret: string; now?: () => Date };

// A verification link stays usable for days, but we only accept a click within 3 of asking.
const VERIFY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

const failure = (code: string): Status => (code === "TOO_MANY_ATTEMPTS_TRY_LATER" ? "wait" : "unavailable");

// A new, unverified Firebase account for the address, replacing one our functions made before.
async function freshAccount({ firebase, store, secret }: Deps, account: string, email: string): Promise<Session | Status> {
  const password = await linkPassword(secret, email);
  let created = await firebase.signUp(email, password);
  if (!created.ok && created.code === "EMAIL_EXISTS") {
    const old = await firebase.signIn(email, password);
    if (!old.ok) return WRONG_CREDENTIALS.has(old.code) ? "address_in_use" : failure(old.code);
    const removed = await firebase.deleteAccount(old.value.idToken);
    if (!removed.ok) return failure(removed.code);
    created = await firebase.signUp(email, password);
  }
  if (!created.ok) return failure(created.code);
  await store.rememberFirebaseAccount(account, created.value.localId);
  return created.value;
}

export async function sendVerification(deps: Deps, user: { id: string; email: string }): Promise<Status> {
  const { firebase, store } = deps;
  if (await store.isVerified(user.id)) return "verified";
  if (!(await store.allow(user.id, "verify_send"))) return "wait";
  const fresh = await freshAccount(deps, user.id, user.email);
  if (typeof fresh === "string") return fresh;
  const sent = await firebase.sendVerification(fresh.idToken);
  return sent.ok ? "sent" : failure(sent.code);
}

export async function checkVerification(deps: Deps, user: { id: string; email: string }): Promise<Status> {
  const { firebase, store } = deps;
  const now = deps.now?.() ?? new Date();
  if (await store.isVerified(user.id)) return "verified";
  if (!(await store.allow(user.id, "verify_check"))) return "wait";
  const asked = await store.latest(user.id, "verify_send");
  if (!asked || now.getTime() - asked.getTime() > VERIFY_WINDOW_MS) return "send_first";

  const session = await firebase.signIn(user.email, await linkPassword(deps.secret, user.email));
  if (!session.ok) return WRONG_CREDENTIALS.has(session.code) ? "send_first" : failure(session.code);
  if (session.value.localId !== (await store.firebaseAccount(user.id))) return "send_first";
  const info = await firebase.lookup(session.value.idToken);
  if (!info.ok) return failure(info.code);
  if (!info.value.emailVerified) return "not_yet";

  await store.markVerified(user.id);
  await firebase.deleteAccount(session.value.idToken); // if this fails, the next email replaces it anyway
  return "verified";
}

// Answers "sent" for an address with no account too, so the form doesn't reveal who has one.
export async function sendReset(deps: Deps, email: string): Promise<Status> {
  const { firebase, store } = deps;
  const account = await store.accountFor(email);
  if (!account) return "sent";
  if (!(await store.allow(account, "reset_send"))) return "wait";
  const fresh = await freshAccount(deps, account, email);
  if (typeof fresh === "string") return fresh;
  const sent = await firebase.sendPasswordReset(email);
  return sent.ok ? "sent" : failure(sent.code);
}

export async function finishReset(deps: Deps, email: string, password: string): Promise<Status> {
  const { firebase, store } = deps;
  if (password.length < 8) return "weak_password";
  const account = await store.accountFor(email);
  if (!account) return "wrong_password";
  if (!(await store.allow(account, "reset_finish"))) return "wait";
  // Our own password signs in without the link ever being used.
  if (password === (await linkPassword(deps.secret, email))) return "wrong_password";

  const session = await firebase.signIn(email, password);
  if (!session.ok) return WRONG_CREDENTIALS.has(session.code) ? "wrong_password" : failure(session.code);
  if (session.value.localId !== (await store.firebaseAccount(account))) return "wrong_password";

  if ((await store.setPassword(account, password)) === "weak") {
    // The Firebase account now has this password, so it can't take another: start over.
    await firebase.deleteAccount(session.value.idToken);
    return "weak_password";
  }
  await store.completeReset(account);
  await firebase.deleteAccount(session.value.idToken);
  return "done";
}
