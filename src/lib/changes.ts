import { currentRecordDraft, discardRecordDraft, recordDraftSnapshot, type RecordDraft, type RecordTable } from "./recordDrafts";
import { discardSiteDraft, parseList, siteTextSnapshot } from "./siteText";
import { mediaUrl, supabase } from "./supabase";

// The editor's unpublished changes, described in plain words for the Changes panel and the
// Publish confirmation: what changed, what it said before, what it says now.

export type ChangeRow = { label: string; before?: string; after?: string };
export type Change = {
  id: string;
  title: string;
  rows: ChangeRow[];
  image?: string;
  undo: () => Promise<string | null>;
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// "about.facts.items" -> "About, facts"
export function siteKeyTitle(key: string): string {
  const [page, ...rest] = key.split(".").filter((part) => part !== "items");
  return [capitalize(page), ...rest].join(", ");
}

const listSummary = (value: string | undefined) => {
  const titles = parseList(value).map((item) => item.title || "(no title)");
  return titles.length === 0 ? "(empty list)" : titles.join(", ");
};

const LABELS: Record<string, string> = {
  title: "Title",
  summary: "Summary",
  description: "Description",
  thumbnail_alt: "Photo description",
  name: "Name",
  headline: "Headline",
  background: "Background",
  major: "Major",
  skills: "Skills",
  clubs_roles: "Clubs and roles",
  repo_url: "Source code link",
  demo_url: "Live demo link",
  poster_url: "Poster link",
  linkedin_url: "LinkedIn link",
  github_url: "GitHub link",
  website_url: "Website link",
};
const PHOTO_COLUMNS = ["thumbnail_path", "photo_path"];
const CONTACT_COLUMNS = ["primary_contact_email", "primary_contact_phone", "contact_email", "contact_phone", "email"];

const KIND: Record<RecordTable, string> = { projects: "Project", profiles: "Student", faculty: "Faculty" };

// "Project: campus-robot" for a history entry, where the title is not at hand.
export const recordLabel = (table: RecordTable, slug: string) => `${KIND[table]}: ${slug}`;

const show = (value: unknown) => {
  if (Array.isArray(value)) return value.join(", ") || "(empty)";
  if (value === null || value === undefined || value === "") return "(empty)";
  return String(value);
};

// Contact details are described, never shown, so the panel can be read over a shoulder.
function describeRecord(draft: RecordDraft, live: Record<string, unknown> | null): Change {
  const { table_name: table, row_slug: slug, patch, gallery } = draft;
  const columns = Object.keys(patch);
  const rows: ChangeRow[] = [];
  const names: string[] = [];
  for (const column of columns) {
    if (PHOTO_COLUMNS.includes(column)) names.push("Photo");
    else if (CONTACT_COLUMNS.includes(column)) names.push("Contact details");
    else {
      const label = LABELS[column] ?? capitalize(column.replace(/_/g, " "));
      names.push(label);
      rows.push({ label, before: show(live?.[column]), after: show(patch[column]) });
    }
  }
  if (gallery) names.push("Photos");
  const photoPath = PHOTO_COLUMNS.map((c) => patch[c]).find((p) => typeof p === "string");
  if (CONTACT_COLUMNS.some((c) => columns.includes(c))) rows.push({ label: "Contact details", after: "Changed (not shown here)" });
  if (gallery) rows.push({ label: "Photos", after: `${gallery.length} in the gallery` });
  const name = live?.title ?? live?.name ?? slug;
  return {
    id: `${table}/${slug}`,
    title: `${KIND[table]}: ${String(name)}`,
    rows: rows.length > 0 ? [{ label: `Changed: ${[...new Set(names)].join(", ")}` }, ...rows] : [{ label: "Changed: Nothing yet" }],
    image: typeof photoPath === "string" ? (mediaUrl(photoPath) ?? undefined) : undefined,
    undo: () => discardRecordDraft(table, slug),
  };
}

async function liveRecord(draft: RecordDraft): Promise<Record<string, unknown> | null> {
  if (!supabase) return null;
  const columns = [...new Set([...Object.keys(draft.patch), draft.table_name === "projects" ? "title" : "name"])];
  const { data } = await supabase
    .from(draft.table_name)
    .select(columns.join(", "))
    .eq("slug", draft.row_slug)
    .maybeSingle<Record<string, unknown>>();
  return data;
}

// Everything waiting to be published, text first, each as one card.
export async function loadChanges(): Promise<Change[]> {
  const { live, drafts } = siteTextSnapshot();
  const text: Change[] = Object.keys(drafts)
    .sort()
    .map((key) => {
      const isList = key.endsWith(".items");
      return {
        id: key,
        title: siteKeyTitle(key),
        rows: [
          {
            label: isList ? "List" : "Text",
            before: isList ? listSummary(live[key]) : (live[key] ?? "(the default wording)"),
            after: isList ? listSummary(drafts[key]) : drafts[key],
          },
        ],
        undo: () => discardSiteDraft(key),
      };
    });
  const records = recordDraftSnapshot();
  const described = await Promise.all(
    records.map(async (d) => describeRecord(currentRecordDraft(d.table_name, d.row_slug) ?? d, await liveRecord(d))),
  );
  return [...text, ...described];
}
