import { useSyncExternalStore } from "react";
import { useOutletContext } from "react-router";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

// The signed-in session, shared by every component: undefined until Supabase has read the stored
// session, null when signed out. Following a password reset link signs the person in, so the
// password page can ask for a new one.

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

// Where links in sign-up and password emails come back to. Supabase must list these under
// Authentication > URL Configuration > Redirect URLs.
function returnUrl(path: string): string {
  return new URL(path, window.location.origin).toString();
}

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await client().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

// Returns true when the account needs its email address confirmed before signing in.
export async function signUp(name: string, email: string, password: string): Promise<boolean> {
  const { data, error } = await client().auth.signUp({
    email: email.trim(),
    password,
    options: { data: { full_name: name.trim() }, emailRedirectTo: returnUrl("/account") },
  });
  if (error) throw error;
  return data.session === null;
}

export async function signOut(): Promise<void> {
  const { error } = await client().auth.signOut();
  if (error) throw error;
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await client().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: returnUrl("/account/password"),
  });
  if (error) throw error;
}

export async function setPassword(password: string): Promise<void> {
  const { error } = await client().auth.updateUser({ password });
  if (error) throw error;
}
