// Supabase client with the publishable key. Row level security decides what the public can
// see. Without the env vars the client is null and content.ts reports that Supabase is not
// configured.
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const supabase = url && key ? createClient(url, key) : null;

// Photos live in the public `media` bucket; database columns hold the path inside it.
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path || !url) return null;
  return new URL(`/storage/v1/object/public/media/${path}`, url).toString();
}
