import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { checkVerification, type Deps, finishReset, sendReset, sendVerification, type Store } from "./account-email.ts";
import { errorCode, type Firebase, firebase as firebaseClient, linkPassword, type Result, type Session } from "./firebase.ts";

const secret = "test-link-secret";
const student = { id: "student-1", email: "sam@franciscan.edu" };

// A Firebase that behaves like the real one for these calls. Links in the outbox only work on the
// account they were sent for, as with Firebase's one-time codes.
function fakeFirebase() {
  type Account = { localId: string; password: string; verified: boolean };
  const accounts = new Map<string, Account>();
  const outbox: { kind: "verify" | "reset"; email: string; localId: string }[] = [];
  let next = 0;
  const fail = (code: string) => ({ ok: false as const, code });
  const session = (a: Account): Result<Session> => ({ ok: true, value: { idToken: `token:${a.localId}`, localId: a.localId } });
  const byToken = (idToken: string) => [...accounts.entries()].find(([, a]) => `token:${a.localId}` === idToken);

  const api: Firebase = {
    async signUp(email, password) {
      if (accounts.has(email)) return fail("EMAIL_EXISTS");
      const account = { localId: `fb-${++next}`, password, verified: false };
      accounts.set(email, account);
      return session(account);
    },
    async signIn(email, password) {
      const account = accounts.get(email);
      return account && account.password === password ? session(account) : fail("INVALID_LOGIN_CREDENTIALS");
    },
    async lookup(idToken) {
      const found = byToken(idToken);
      return found ? { ok: true, value: { emailVerified: found[1].verified } } : fail("INVALID_ID_TOKEN");
    },
    async sendVerification(idToken) {
      const found = byToken(idToken);
      if (!found) return fail("INVALID_ID_TOKEN");
      outbox.push({ kind: "verify", email: found[0], localId: found[1].localId });
      return { ok: true, value: undefined };
    },
    async sendPasswordReset(email) {
      const account = accounts.get(email);
      if (account) outbox.push({ kind: "reset", email, localId: account.localId });
      return { ok: true, value: undefined };
    },
    async deleteAccount(idToken) {
      const found = byToken(idToken);
      if (!found) return fail("INVALID_ID_TOKEN");
      accounts.delete(found[0]);
      return { ok: true, value: undefined };
    },
  };

  // What the person does with the newest email of a kind, on Firebase's own page.
  function use(kind: "verify" | "reset", email: string, newPassword?: string): boolean {
    const link = outbox.findLast((m) => m.kind === kind && m.email === email);
    const account = accounts.get(email);
    if (!link || !account || account.localId !== link.localId) return false; // "this link has expired"
    account.verified = true;
    if (newPassword) account.password = newPassword;
    return true;
  }

  return { api, accounts, outbox, use };
}

function fakeStore() {
  const verified = new Set<string>();
  const requests: { account: string; kind: string; at: Date }[] = [];
  const passwords = new Map<string, string>();
  const firebaseIds = new Map<string, string>();
  const users = new Map([[student.email, student.id]]);
  const state = { now: new Date("2026-10-20T15:00:00Z"), allowAll: true, weak: new Set<string>(), resets: [] as string[] };
  const store: Store = {
    isVerified: async (account) => verified.has(account),
    async allow(account, kind) {
      if (!state.allowAll) return false;
      requests.push({ account, kind, at: state.now });
      return true;
    },
    latest: async (account, kind) => requests.findLast((r) => r.account === account && r.kind === kind)?.at ?? null,
    markVerified: async (account) => void verified.add(account),
    accountFor: async (email) => users.get(email.trim().toLowerCase()) ?? null,
    rememberFirebaseAccount: async (account, firebaseId) => void firebaseIds.set(account, firebaseId),
    firebaseAccount: async (account) => firebaseIds.get(account) ?? null,
    async setPassword(account, password) {
      if (state.weak.has(password)) return "weak";
      passwords.set(account, password);
      return "ok";
    },
    async completeReset(account) {
      verified.add(account);
      state.resets.push(account);
    },
  };
  return { store, verified, passwords, state };
}

let fb: ReturnType<typeof fakeFirebase>;
let db: ReturnType<typeof fakeStore>;
let deps: Deps;

beforeEach(() => {
  fb = fakeFirebase();
  db = fakeStore();
  deps = { firebase: fb.api, store: db.store, secret, now: () => db.state.now };
});

test("verification: send, click the link, check", async () => {
  assert.equal(await sendVerification(deps, student), "sent");
  assert.equal(fb.outbox.length, 1);
  assert.equal(await checkVerification(deps, student), "not_yet");
  assert.ok(fb.use("verify", student.email));
  assert.equal(await checkVerification(deps, student), "verified");
  assert.ok(db.verified.has(student.id));
  assert.equal(fb.accounts.size, 0, "the Firebase account is deleted once used");
  assert.equal(await sendVerification(deps, student), "verified", "nothing more is sent");
});

test("only the newest verification email counts", async () => {
  await sendVerification(deps, student);
  const first = fb.outbox[0];
  await sendVerification(deps, student);
  // The first email's link is for an account that no longer exists, so clicking it does nothing.
  assert.notEqual(fb.accounts.get(student.email)?.localId, first.localId);
  assert.equal(await checkVerification(deps, student), "not_yet");
});

test("an earlier click doesn't carry over to a new email", async () => {
  await sendVerification(deps, student);
  fb.use("verify", student.email);
  await sendVerification(deps, student); // replaces the clicked account with a new one
  assert.equal(await checkVerification(deps, student), "not_yet");
});

test("checking needs a recent verification email", async () => {
  assert.equal(await checkVerification(deps, student), "send_first");
  await sendVerification(deps, student);
  fb.use("verify", student.email);
  db.state.now = new Date(db.state.now.getTime() + 4 * 24 * 60 * 60 * 1000);
  assert.equal(await checkVerification(deps, student), "send_first");
});

test("a Firebase account someone else made never counts", async () => {
  // Someone uses Firebase's public key to make an account for the address, with their password.
  await fb.api.signUp(student.email, "someone-elses-password");
  fb.accounts.get(student.email)!.verified = true;
  assert.equal(await sendVerification(deps, student), "address_in_use");
  assert.equal(await checkVerification(deps, student), "send_first");
  assert.equal(await sendReset(deps, student.email), "address_in_use");
  assert.equal(await finishReset(deps, student.email, "someone-elses-password"), "wrong_password");
  assert.equal(fb.outbox.length, 0);
  assert.ok(!db.verified.has(student.id));
  assert.equal(db.passwords.size, 0);
});

test("password reset: send, choose a password on Firebase's page, finish here", async () => {
  assert.equal(await sendReset(deps, student.email), "sent");
  assert.ok(fb.use("reset", student.email, "my new password"));
  assert.equal(await finishReset(deps, student.email, "my new password"), "done");
  assert.equal(db.passwords.get(student.id), "my new password");
  assert.deepEqual(db.state.resets, [student.id], "the account is verified and its other sessions end");
  assert.equal(fb.accounts.size, 0);
});

test("finishing a reset needs the password chosen through the email", async () => {
  await sendReset(deps, student.email);
  assert.equal(await finishReset(deps, student.email, "a guess at it"), "wrong_password", "before the link is used");
  assert.equal(await finishReset(deps, student.email, await linkPassword(secret, student.email)), "wrong_password", "nor our own password");
  fb.use("reset", student.email, "my new password");
  assert.equal(await finishReset(deps, student.email, "a guess at it"), "wrong_password");
  assert.equal(await finishReset(deps, student.email, "short"), "weak_password");
  assert.equal(db.passwords.size, 0);
});

test("a reset left unfinished can be finished later, and blocks new emails until then", async () => {
  await sendReset(deps, student.email);
  fb.use("reset", student.email, "chosen last week");
  db.state.now = new Date(db.state.now.getTime() + 7 * 24 * 60 * 60 * 1000);
  assert.equal(await sendReset(deps, student.email), "address_in_use");
  assert.equal(await finishReset(deps, student.email, "chosen last week"), "done");
  assert.equal(await sendReset(deps, student.email), "sent");
});

test("a password the site refuses means starting the reset again", async () => {
  db.state.weak.add("password1");
  await sendReset(deps, student.email);
  fb.use("reset", student.email, "password1");
  assert.equal(await finishReset(deps, student.email, "password1"), "weak_password");
  assert.equal(fb.accounts.size, 0);
  assert.equal(await sendReset(deps, student.email), "sent");
});

test("an address without an account gets the same answer and no email", async () => {
  assert.equal(await sendReset(deps, "nobody@franciscan.edu"), "sent");
  assert.equal(fb.outbox.length, 0);
});

test("asking too often sends nothing", async () => {
  db.state.allowAll = false;
  assert.equal(await sendVerification(deps, student), "wait");
  assert.equal(await sendReset(deps, student.email), "wait");
  assert.equal(fb.outbox.length, 0);
});

test("the link password is fixed per address and secret", async () => {
  const a = await linkPassword(secret, "sam@franciscan.edu");
  assert.equal(a, await linkPassword(secret, " SAM@franciscan.edu "));
  assert.notEqual(a, await linkPassword(secret, "alex@franciscan.edu"));
  assert.notEqual(a, await linkPassword("another secret", "sam@franciscan.edu"));
  assert.match(a, /^Aa1-[A-Za-z0-9_-]{43}$/);
});

test("the client sends Firebase's requests and reads its errors", async () => {
  const calls: { url: string; body: unknown }[] = [];
  const send = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    if (url.includes("accounts:signUp")) {
      return Response.json({ error: { code: 400, message: "EMAIL_EXISTS" } }, { status: 400 });
    }
    return Response.json({ idToken: "t", localId: "u", email: "x" });
  }) as typeof fetch;
  const client = firebaseClient("public-key", send);
  assert.deepEqual(await client.signUp("a@franciscan.edu", "pw"), { ok: false, code: "EMAIL_EXISTS" });
  assert.deepEqual(await client.signIn("a@franciscan.edu", "pw"), { ok: true, value: { idToken: "t", localId: "u" } });
  await client.sendPasswordReset("a@franciscan.edu");
  assert.equal(calls[1].url, "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=public-key");
  assert.deepEqual(calls[2].body, { requestType: "PASSWORD_RESET", email: "a@franciscan.edu" });
  assert.equal(errorCode({ error: { message: "WEAK_PASSWORD : Password should be at least 6 characters" } }), "WEAK_PASSWORD");
  assert.equal(errorCode(null), "UNKNOWN");
});
