// Only paths on this site, so a crafted ?next= link can't send someone elsewhere after sign-in.
// In its own file, without the Supabase client, so the unit tests can load it.
export function safeNext(next: string | null): string {
  return next && /^\/(?![/\\])/.test(next) ? next : "/account";
}
