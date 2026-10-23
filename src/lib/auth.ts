import { useSyncExternalStore } from "react";
import { useOutletContext } from "react-router";
import type { Session } from "@supabase/supabase-js";
import { useAsync } from "./hooks";
import { supabase } from "./supabase";

// The signed-in session, shared by every component: undefined until Supabase has read the stored
// session, null when signed out.

let session: Session | null | undefined = supabase ? undefined : null;
const listeners = new Set<() => void>();

supabase?.auth.onAuthStateChange((_event, next) => {
  session = next;
  listeners.forEach((listener) => listener());
});

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSession(): Session | null | undefined {
  return useSyncExternalStore(subscribe, () => session);
}

// Inside the signed-in pages (AccountLayout), the session is always there.
export function useSignedInSession(): Session {
  return useOutletContext<Session>();
}

export { safeNext } from "./safeNext";

// Where Google and GitHub sign-in come back to. Supabase must list these under
// Authentication > URL Configuration > Redirect URLs.
function returnUrl(path: string): string {
  return new URL(path, window.location.origin).toString();
}

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

// `captchaToken` is the form's Turnstile token (src/lib/turnstile.ts); Supabase checks it once
// CAPTCHA protection is on for the project, and ignores it until then.
export async function signIn(email: string, password: string, captchaToken?: string | null): Promise<void> {
  const { error } = await client().auth.signInWithPassword({
    email: email.trim(),
    password,
    options: { captchaToken: captchaToken ?? undefined },
  });
  if (error) throw error;
}

// Returns true when the account needs its email address confirmed before signing in.
export async function signUp(name: string, email: string, password: string, captchaToken?: string | null): Promise<boolean> {
  const { data, error } = await client().auth.signUp({
    email: email.trim(),
    password,
    options: { data: { full_name: name.trim() }, emailRedirectTo: returnUrl("/account"), captchaToken: captchaToken ?? undefined },
  });
  if (error) throw error;
  return data.session === null;
}

export type Provider = "google" | "github";

// Leaves the site for Google or GitHub, which send the person back to the sign-in page. That page
// shows any error (such as a non-Franciscan address) and otherwise moves on to `next`.
export async function signInWithProvider(provider: Provider, next: string): Promise<void> {
  const { error } = await client().auth.signInWithOAuth({
    provider,
    options: { redirectTo: returnUrl(`/account/sign-in?next=${encodeURIComponent(next)}`) },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await client().auth.signOut();
  if (error) throw error;
}

// Changes the signed-in person's password, and clears the note about a removed one.
export async function setPassword(password: string): Promise<void> {
  const { error } = await client().auth.updateUser({ password });
  if (error) throw error;
  await client().rpc("dismiss_password_notice");
  verificationChanged();
}

// Verification ---------------------------------------------------------------------------------
// An account can submit, give permissions or review only once its email address is verified: by
// signing in with Google or GitHub, or with a link we email through Google Firebase (see
// supabase/functions/_shared/account-email.ts). The database enforces it.

export type Verification = {
  verified: boolean;
  method: "google" | "github" | "email" | "admin" | null;
  // A Google or GitHub sign-in turned off the password the account had, in case someone else chose it.
  passwordRemoved: boolean;
};

export async function getVerification(): Promise<Verification> {
  const { data, error } = await client().rpc("my_verification");
  if (error) throw error;
  const row = data?.[0];
  return {
    verified: row?.verified ?? false,
    method: (row?.method as Verification["method"]) ?? null,
    passwordRemoved: row?.password_removed ?? false,
  };
}

// Bumped when the verification changes, so every page showing it loads it again.
let verificationVersion = 0;
const verificationListeners = new Set<() => void>();

function verificationChanged() {
  verificationVersion += 1;
  verificationListeners.forEach((listener) => listener());
}

function subscribeVerification(listener: () => void) {
  verificationListeners.add(listener);
  return () => verificationListeners.delete(listener);
}

// `userId` and `version` only decide when to load it again.
async function loadVerification(userId: string, version: number): Promise<Verification> {
  void userId;
  void version;
  return getVerification();
}

export function useVerification(userId: string): Verification | undefined {
  const version = useSyncExternalStore(subscribeVerification, () => verificationVersion);
  return useAsync(loadVerification, userId, version);
}

export async function dismissPasswordNotice(): Promise<void> {
  const { error } = await client().rpc("dismiss_password_notice");
  if (error) throw error;
  verificationChanged();
}

// What the verify-email and password-reset functions answer.
export type EmailStatus =
  | "sent"
  | "verified"
  | "not_yet"
  | "send_first"
  | "wrong_password"
  | "weak_password"
  | "done"
  | "wait"
  | "address_in_use"
  | "captcha_failed"
  | "unavailable";

async function callEmailFunction(name: "verify-email" | "password-reset", body: object): Promise<EmailStatus> {
  const { data, error } = await client().functions.invoke<{ status: EmailStatus }>(name, { body });
  if (!error) return data?.status ?? "unavailable";
  // Answers like "unavailable" (503) still say what happened.
  const response = (error as { context?: Response }).context;
  const answer = response instanceof Response ? await response.json().catch(() => null) : null;
  if (answer && typeof answer.status === "string" && answer.status !== "bad_request") return answer.status;
  throw error;
}

export const sendVerificationEmail = () => callEmailFunction("verify-email", { action: "send" });

export async function checkVerificationEmail(): Promise<EmailStatus> {
  const status = await callEmailFunction("verify-email", { action: "check" });
  if (status === "verified") verificationChanged();
  return status;
}

// Both need the form's Turnstile token, which the function checks (src/lib/turnstile.ts).
export const sendResetEmail = (email: string, captcha: string | null) =>
  callEmailFunction("password-reset", { action: "send", email: email.trim(), captcha });

export const finishReset = (email: string, password: string, captcha: string | null) =>
  callEmailFunction("password-reset", { action: "finish", email: email.trim(), password, captcha });

// Answers both pages explain the same way.
export const EMAIL_PROBLEMS: Partial<Record<EmailStatus, string>> = {
  wait: "You've asked for a few emails already. Wait a minute and try again; after five in a day, try again tomorrow.",
  address_in_use:
    "We can't send an email to this address right now. If you started a password reset and chose a new password, finish it on the Reset password page. Otherwise, email franciscan.eac@gmail.com from your university address and we'll sort it out.",
  unavailable: "The email service isn't working right now. Try again in a few minutes.",
  captcha_failed: "The check that you're a person didn't pass. Wait for it to finish, then try again.",
};
