// Read-only access to Supabase's REST API (PostgREST) with the publishable key.
// Row level security decides what the public can see, so this only ever returns published
// content. Without the env vars, callers fall back to the sample data in content.ts.

const REVALIDATE_SECONDS = 3600;

export function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export async function restGet<T>(path: string): Promise<T> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const res = await fetch(new URL(`/rest/v1/${path}`, base), {
    headers: { apikey: key, Accept: "application/json" },
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (!res.ok) throw new Error(`Supabase request failed: ${res.status} ${res.statusText}`);
  return res.json();
}

// Photos live in the public `media` bucket; database columns hold the path inside it.
export function mediaUrl(path: string | null | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!path || !base) return null;
  return new URL(`/storage/v1/object/public/media/${path}`, base).toString();
}
