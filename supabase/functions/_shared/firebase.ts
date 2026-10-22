// Google Firebase Authentication's REST API (Identity Toolkit), used only to send verification and
// password-reset emails. Supabase stays the sign-in system: each Firebase account exists only
// while an email is in flight, and is deleted once its link has done its job. See
// account-email.ts for how the two fit together.
//
// The API key is Firebase's public "web API key" (Project settings > General); the requests
// themselves prove nothing without an account's password or a link from its inbox.

export type Result<T> = { ok: true; value: T } | { ok: false; code: string };

export type AccountInfo = { emailVerified: boolean };

// idToken acts as the account in the calls below; localId is the account's permanent id.
export type Session = { idToken: string; localId: string };

export type Firebase = {
  signUp(email: string, password: string): Promise<Result<Session>>;
  signIn(email: string, password: string): Promise<Result<Session>>;
  lookup(idToken: string): Promise<Result<AccountInfo>>;
  sendVerification(idToken: string): Promise<Result<void>>;
  sendPasswordReset(email: string): Promise<Result<void>>;
  deleteAccount(idToken: string): Promise<Result<void>>;
};

// Firebase answers errors as {"error": {"message": "EMAIL_EXISTS"}}, sometimes followed by
// " : details".
export function errorCode(body: unknown): string {
  const message = (body as { error?: { message?: unknown } })?.error?.message;
  return typeof message === "string" ? message.split(/[\s:]/)[0] : "UNKNOWN";
}

// Sign-in failures that mean "not this password", as opposed to Firebase being unavailable.
export const WRONG_CREDENTIALS = new Set(["INVALID_LOGIN_CREDENTIALS", "INVALID_PASSWORD", "EMAIL_NOT_FOUND", "USER_DISABLED"]);

export const FIREBASE_API = "https://identitytoolkit.googleapis.com/v1";

// `base` is only changed to test against a stand-in for Firebase.
export function firebase(apiKey: string, send: typeof fetch = fetch, base = FIREBASE_API): Firebase {
  async function call<T>(method: string, body: object): Promise<Result<T>> {
    let response: Response;
    try {
      response = await send(`${base}/accounts:${method}?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      return { ok: false, code: "NETWORK" };
    }
    const data: unknown = await response.json().catch(() => null);
    return response.ok ? { ok: true, value: data as T } : { ok: false, code: errorCode(data) };
  }

  const session = (result: Result<Session>): Result<Session> =>
    result.ok ? { ok: true, value: { idToken: result.value.idToken, localId: result.value.localId } } : result;
  const done = (result: Result<unknown>): Result<void> => (result.ok ? { ok: true, value: undefined } : result);

  return {
    signUp: async (email, password) => session(await call("signUp", { email, password, returnSecureToken: true })),
    signIn: async (email, password) => session(await call("signInWithPassword", { email, password, returnSecureToken: true })),
    async lookup(idToken) {
      const result = await call<{ users?: { emailVerified?: boolean }[] }>("lookup", { idToken });
      if (!result.ok) return result;
      return { ok: true, value: { emailVerified: result.value.users?.[0]?.emailVerified === true } };
    },
    sendVerification: async (idToken) => done(await call("sendOobCode", { requestType: "VERIFY_EMAIL", idToken })),
    sendPasswordReset: async (email) => done(await call("sendOobCode", { requestType: "PASSWORD_RESET", email })),
    deleteAccount: async (idToken) => done(await call("delete", { idToken })),
  };
}

// The password our functions give an address's Firebase account. Nobody types it: it lets the
// functions sign in to accounts they made, and nobody else can, because the secret stays in
// Supabase. Changing FIREBASE_LINK_SECRET only strands emails already in flight.
export async function linkPassword(secret: string, email: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(email.trim().toLowerCase())));
  const base64 = btoa(String.fromCharCode(...mac)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  // A fixed start meets any password rule Firebase might be set to (cases, digit, symbol).
  return `Aa1-${base64}`;
}
