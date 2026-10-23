import { mediaUrl, supabase } from "./supabase";

// The pool the home page highlights come from. An editor switches a project, student or alumni
// story "on" (a row in `highlights`); the home page shows a few of them, a different few each day.
// Like events, a highlight has no draft step: switching it is live at once, and the database
// decides who may (row level security).

export type HighlightKind = "project" | "student" | "alumni";

export type Highlight = {
  kind: HighlightKind;
  ref: string;
  blurb: string;
  name: string;
  detail: string;
  slug: string | null;
  image: string | null;
};

type HighlightRow = Omit<Highlight, "image"> & { image_path: string | null };

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

// For the home page, where highlights are a small extra: a failed load hides them, not the page.
export async function getHomeHighlights(): Promise<Highlight[]> {
  try {
    const { data, error } = await client()
      .from("home_highlights")
      .select("kind, ref, blurb, name, detail, slug, image_path")
      .returns<HighlightRow[]>();
    if (error) throw error;
    return data.map(({ image_path, ...row }) => ({ ...row, image: mediaUrl(image_path) }));
  } catch {
    return [];
  }
}

// Whether a page's project, student or story is in the pool, and its one-line note.
export async function getHighlightState(kind: HighlightKind, ref: string): Promise<{ on: boolean; blurb: string }> {
  const { data, error } = await client().from("highlights").select("blurb").eq("kind", kind).eq("ref", ref).maybeSingle();
  if (error) throw error;
  return { on: !!data, blurb: data?.blurb ?? "" };
}

export async function setHighlight(kind: HighlightKind, ref: string, on: boolean, blurb = ""): Promise<void> {
  if (!on) {
    const { error } = await client().from("highlights").delete().eq("kind", kind).eq("ref", ref);
    if (error) throw error;
    return;
  }
  const { error } = await client().from("highlights").upsert({ kind, ref, blurb: blurb.trim() }, { onConflict: "kind,ref" });
  if (error) throw error;
}
