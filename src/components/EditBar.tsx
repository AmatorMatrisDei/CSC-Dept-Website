import { useEffect, useState } from "react";
import { useEdit } from "@/lib/edit";
import { loadPhotoHistory, restorePhotoVersion } from "@/lib/projectPhotos";
import { mediaUrl } from "@/lib/supabase";
import { loadRecordDrafts, loadRecordHistory, restoreRecordVersion, useRecordDraftNames } from "@/lib/recordDrafts";
import {
  discardSiteDrafts,
  loadSiteDrafts,
  loadSiteHistory,
  publishSiteDrafts,
  restoreSiteText,
  useDraftKeys,
} from "@/lib/siteText";

// The editors' bar along the bottom of the page: the Edit mode switch and the unpublished
// changes. It folds down to a small tab so it stays out of the way.
const OPEN_KEY = "editBarOpen";

function wasOpen() {
  try {
    return localStorage.getItem(OPEN_KEY) !== "false";
  } catch {
    return true;
  }
}

type Version = { id: string; label: string; summary: string; when: string; image?: string; restore: () => Promise<string | null> };

const summarize = (before: Record<string, unknown>) =>
  Object.entries(before)
    .filter(([column]) => column !== "photo_path")
    .map(([column, value]) => `${column.replace(/_/g, " ")}: ${Array.isArray(value) ? value.join(", ") : String(value ?? "(empty)")}`)
    .join("; ");

// Page text and record details together, newest first.
async function loadVersions(): Promise<Version[] | string> {
  const [text, records, photos] = await Promise.all([loadSiteHistory(), loadRecordHistory(), loadPhotoHistory()]);
  if (typeof text === "string") return text;
  if (typeof records === "string") return records;
  if (typeof photos === "string") return photos;
  return [
    ...text.map((e) => ({
      id: `text-${e.id}`,
      label: e.key,
      summary: e.value,
      when: e.replaced_at,
      restore: () => restoreSiteText(e.id),
    })),
    ...records.map((e) => ({
      id: `record-${e.id}`,
      label: `${e.table_name}/${e.row_slug}`,
      summary: "photo_path" in e.before ? [e.before.photo_path ? "photo" : "no photo", summarize(e.before)].filter(Boolean).join("; ") : summarize(e.before),
      when: e.replaced_at,
      image: typeof e.before.photo_path === "string" ? (mediaUrl(e.before.photo_path) ?? undefined) : undefined,
      restore: () => restoreRecordVersion(e.id),
    })),
    ...photos.map((e) => ({
      id: `photo-${e.id}`,
      label: `photo of ${e.project_slug}`,
      summary: `${e.kind === "cover" ? "cover photo" : "gallery photo"}: ${e.alt_text || "(no description)"}`,
      when: e.replaced_at,
      image: mediaUrl(e.storage_path) ?? undefined,
      restore: () => restorePhotoVersion(e),
    })),
  ].sort((x, y) => y.when.localeCompare(x.when));
}

function HistoryPanel() {
  const [entries, setEntries] = useState<Version[] | string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void loadVersions().then(setEntries);
  }, []);

  async function restore(entry: Version) {
    setNote((await entry.restore()) ?? "Put back as a draft. Publish to make it live.");
  }

  return (
    <div className="mx-auto mb-2 max-h-64 max-w-6xl overflow-y-auto rounded border border-border p-3">
      <h2 className="text-base font-semibold">Earlier versions</h2>
      <p className="text-sm text-muted" role="status">
        {note}
      </p>
      {entries === null ? (
        <p className="text-sm">Loading…</p>
      ) : typeof entries === "string" ? (
        <p className="text-sm">{entries}</p>
      ) : entries.length === 0 ? (
        <p className="text-sm">Nothing has been replaced yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2 text-sm">
              {e.image && <img src={e.image} alt="" className="h-11 w-16 rounded border border-border object-cover" />}
              <span className="font-medium">{e.label}</span>
              <span className="text-muted">{new Date(e.when).toLocaleString()}</span>
              <span className="min-w-0 flex-1 truncate">{e.summary}</span>
              <button type="button" onClick={() => void restore(e)} className="min-h-11 rounded border border-border px-3 hover:bg-current/10">
                Restore<span className="sr-only"> {e.label} from {new Date(e.when).toLocaleString()}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function EditBar() {
  const { editing, setEditing } = useEdit();
  const keys = [...useDraftKeys(), ...useRecordDraftNames()];
  const [open, setOpen] = useState(wasOpen);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    void loadSiteDrafts();
    void loadRecordDrafts();
  }, []);

  function toggleOpen(next: boolean) {
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, String(next));
    } catch {
      // The bar still works without remembering its state.
    }
  }

  async function run(action: () => Promise<string | null>) {
    setBusy(true);
    setNote(await action());
    setBusy(false);
  }

  const button = "min-h-11 rounded border border-border px-3 text-sm hover:bg-current/10 disabled:opacity-60";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => toggleOpen(true)}
        aria-expanded="false"
        className="fixed bottom-0 right-4 z-40 min-h-11 rounded-t border border-b-0 border-border bg-surface px-4 text-sm shadow-lg"
      >
        {editing ? "Editing" : "Edit"}
        {keys.length > 0 && ` (${keys.length} unpublished)`}
      </button>
    );
  }

  return (
    <div role="region" aria-label="Edit tools" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface px-4 py-2 shadow-lg">
      {showHistory && <HistoryPanel />}
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          role="switch"
          aria-checked={editing}
          onClick={() => setEditing(!editing)}
          className="inline-flex min-h-11 items-center gap-2 rounded px-3 text-sm hover:bg-current/10"
        >
          <span aria-hidden="true" className={`inline-block h-5 w-9 rounded-full p-0.5 ${editing ? "bg-accent" : "bg-border"}`}>
            <span className={`block size-4 rounded-full bg-accent-foreground transition-transform motion-reduce:transition-none ${editing ? "translate-x-4" : ""}`} />
          </span>
          Edit mode
        </button>
        {(keys.length > 0 || note) && (
          <p className="text-sm" role="status">
            {note ?? `${keys.length} unpublished ${keys.length === 1 ? "change" : "changes"}: only you can see ${keys.length === 1 ? "it" : "them"} until you publish.`}
          </p>
        )}
        {keys.length > 0 && (
          <>
            <button type="button" disabled={busy} onClick={() => run(publishSiteDrafts)} className={`${button} bg-accent text-accent-foreground`}>
              Publish
            </button>
            <button type="button" disabled={busy} onClick={() => run(discardSiteDrafts)} className={button}>
              Discard
            </button>
          </>
        )}
        <button type="button" aria-expanded={showHistory} onClick={() => setShowHistory(!showHistory)} className={button}>
          History
        </button>
        <button type="button" onClick={() => toggleOpen(false)} aria-expanded="true" className={`${button} ml-auto`}>
          Hide
        </button>
      </div>
    </div>
  );
}
