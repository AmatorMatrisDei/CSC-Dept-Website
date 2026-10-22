import { type ReactNode, useEffect, useRef, useState } from "react";
import { type Change, loadChanges, recordLabel, siteKeyTitle } from "@/lib/changes";
import { useEdit } from "@/lib/edit";
import { loadPhotoHistory, restorePhotoVersion } from "@/lib/projectPhotos";
import { mediaUrl } from "@/lib/supabase";
import { showToast, useToast } from "@/lib/toast";
import { loadRecordDrafts, loadRecordHistory, restoreRecordVersion, useRecordDraftNames } from "@/lib/recordDrafts";
import {
  discardSiteDrafts,
  loadSiteDrafts,
  loadSiteHistory,
  publishSiteDrafts,
  restoreSiteText,
  useDraftKeys,
} from "@/lib/siteText";

// The editors' tools: a small pill that floats at the bottom of the page with the Edit switch,
// History, the unpublished Changes and Publish. Panels open above it, one at a time.

type Version = { id: string; label: string; summary: string; when: string; batch: number | null; image?: string; restore: () => Promise<string | null> };

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
      label: siteKeyTitle(e.key),
      batch: e.batch,
      summary: e.value,
      when: e.replaced_at,
      restore: () => restoreSiteText(e.id),
    })),
    ...records.map((e) => ({
      id: `record-${e.id}`,
      label: recordLabel(e.table_name, e.row_slug),
      batch: e.batch,
      summary: "photo_path" in e.before ? [e.before.photo_path ? "photo" : "no photo", summarize(e.before)].filter(Boolean).join("; ") : summarize(e.before),
      when: e.replaced_at,
      image: typeof e.before.photo_path === "string" ? (mediaUrl(e.before.photo_path) ?? undefined) : undefined,
      restore: () => restoreRecordVersion(e.id),
    })),
    ...photos.map((e) => ({
      id: `photo-${e.id}`,
      label: `Photo of ${e.project_slug}`,
      batch: e.batch,
      summary: `${e.kind === "cover" ? "cover photo" : "gallery photo"}: ${e.alt_text || "(no description)"}`,
      when: e.replaced_at,
      image: mediaUrl(e.storage_path) ?? undefined,
      restore: () => restorePhotoVersion(e),
    })),
  ].sort((x, y) => y.when.localeCompare(x.when));
}

// A card above the pill on wide screens; a sheet from the bottom edge on phones.
function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <section
      role="dialog"
      aria-label={title}
      className="edit-fade pointer-events-auto max-h-[60vh] w-full max-w-md overflow-y-auto rounded-[18px] border border-border bg-surface p-4 text-foreground shadow-xl max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-50 max-sm:max-h-[80vh] max-sm:max-w-none max-sm:rounded-b-none"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        <button type="button" onClick={onClose} className="min-h-11 rounded-full px-3 text-sm hover:bg-foreground/10 sm:hidden">
          Close
        </button>
      </div>
      {children}
    </section>
  );
}

const panelButton = "min-h-11 rounded-full border border-border px-4 text-sm hover:bg-foreground/10 disabled:opacity-60";

type Group = { key: string; batch: number | null; when: string; entries: Version[] };

// One group per publish. Entries from before publishes were labelled are grouped by time instead.
function groupVersions(entries: Version[]): Group[] {
  const groups: Group[] = [];
  for (const e of entries) {
    const near = (g: Group) => g.batch === null && e.batch === null && Math.abs(Date.parse(g.entries[g.entries.length - 1].when) - Date.parse(e.when)) < 5000;
    const group = groups.find((g) => (e.batch !== null && g.batch === e.batch) || near(g));
    if (group) group.entries.push(e);
    else groups.push({ key: `${e.batch ?? "t"}-${e.id}`, batch: e.batch, when: e.when, entries: [e] });
  }
  return groups;
}

// Earlier versions, grouped by the publish that replaced them. Restoring puts things back as
// drafts and hands over to the Changes panel, where they can be looked over before publishing.
function HistoryPanel({ onClose, onRestored }: { onClose: () => void; onRestored: () => void }) {
  const [entries, setEntries] = useState<Version[] | string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadVersions().then(setEntries);
  }, []);

  async function restore(list: Version[]) {
    setBusy(true);
    let problem: string | null = null;
    for (const entry of list) {
      problem = await entry.restore();
      if (problem) break;
    }
    setBusy(false);
    if (problem) showToast(problem);
    else {
      showToast("Put back as a draft. Look it over, then publish.");
      onRestored();
    }
  }

  return (
    <Panel title="History" onClose={onClose}>
      {entries === null ? (
        <p className="text-sm">Loading…</p>
      ) : typeof entries === "string" ? (
        <p className="text-sm">{entries}</p>
      ) : entries.length === 0 ? (
        <p className="text-sm">Nothing has been replaced yet.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          <li className="rounded-xl bg-draft/20 p-3 text-sm font-semibold">Live now</li>
          {groupVersions(entries).map((g) => {
            const when = new Date(g.when).toLocaleString();
            return (
              <li key={g.key} className="rounded-xl border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">
                    Before {when}
                    <span className="font-normal text-muted"> · {g.entries.length} {g.entries.length === 1 ? "change" : "changes"}</span>
                  </p>
                  <button type="button" disabled={busy} onClick={() => void restore(g.entries)} className={panelButton}>
                    Restore page to this<span className="sr-only"> (before {when})</span>
                  </button>
                </div>
                <ul className="mt-2 flex flex-col gap-3">
                  {g.entries.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-2">
                      {e.image && <img src={e.image} alt="" className="h-11 w-16 rounded border border-border object-cover" />}
                      <span className="font-medium">{e.label}</span>
                      <span className="min-w-0 basis-full truncate text-muted">{e.summary}</span>
                      <button type="button" disabled={busy} onClick={() => void restore([e])} className={panelButton}>
                        Restore<span className="sr-only"> {e.label} from {when}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

// Each unpublished change as a card: what it is, the old wording struck through, the new below.
function ChangesPanel({ keys, busy, onClose, onDiscard, onPublish }: { keys: string[]; busy: boolean; onClose: () => void; onDiscard: () => void; onPublish: (changes: Change[]) => void }) {
  const [changes, setChanges] = useState<Change[] | null>(null);
  const signature = keys.join("|");

  useEffect(() => {
    let current = true;
    void loadChanges().then((list) => current && setChanges(list));
    return () => {
      current = false;
    };
  }, [signature]);

  async function undo(change: Change) {
    const problem = await change.undo();
    showToast(problem ?? "Undone. The page is back to what visitors see.");
  }

  return (
    <Panel title="Unpublished changes" onClose={onClose}>
      {keys.length === 0 ? (
        <p className="text-sm">Nothing waiting. Visitors see everything you've done.</p>
      ) : changes === null ? (
        <p className="text-sm">Loading…</p>
      ) : (
        <>
          <ul className="mb-3 flex flex-col gap-3">
            {changes.map((c) => (
              <li key={c.id} className="rounded-xl border border-border p-3 text-sm">
                <div className="flex items-start gap-3">
                  {c.image && <img src={c.image} alt="" className="h-11 w-16 shrink-0 rounded border border-border object-cover" />}
                  <p className="min-w-0 flex-1 font-semibold">{c.title}</p>
                  <button type="button" onClick={() => void undo(c)} className={panelButton}>
                    Undo<span className="sr-only"> {c.title}</span>
                  </button>
                </div>
                {c.rows.map((r) => (
                  <div key={r.label} className="mt-2">
                    {r.before === undefined && r.after === undefined ? (
                      <p className="text-muted">{r.label}</p>
                    ) : (
                      <>
                        <p className="text-muted">{r.label}</p>
                        {r.before !== undefined && <p className="break-words text-muted line-through">{r.before}</p>}
                        {r.after !== undefined && <p className="break-words">{r.after}</p>}
                      </>
                    )}
                  </div>
                ))}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" disabled={busy} onClick={onDiscard} className={panelButton}>
              Discard all
            </button>
            <button type="button" disabled={busy} onClick={() => onPublish(changes)} className={`${panelButton} bg-inverse text-on-inverse`}>
              Publish…
            </button>
          </div>
        </>
      )}
    </Panel>
  );
}

// "Publish N changes?" — a dimmed dialog that names the first few and reassures about history.
function PublishDialog({ changes, busy, onCancel, onConfirm }: { changes: Change[]; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);
  const shown = changes.slice(0, 6);
  const word = changes.length === 1 ? "change" : "changes";
  return (
    <div className="edit-fade pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="publish-title" className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-[18px] border border-border bg-surface p-5 text-foreground shadow-xl">
        <h2 id="publish-title" className="text-lg font-semibold">
          Publish {changes.length} {word}?
        </h2>
        <p className="mt-1 text-sm text-muted">Visitors will see them right away. The old wording stays in History, so you can put it back.</p>
        <ul className="my-3 list-disc pl-5 text-sm">
          {shown.map((c) => (
            <li key={c.id}>{c.title}</li>
          ))}
          {changes.length > shown.length && <li className="list-none text-muted">and {changes.length - shown.length} more</li>}
        </ul>
        <div className="flex flex-wrap justify-end gap-2">
          <button ref={first} type="button" onClick={onCancel} className={panelButton}>
            Not yet
          </button>
          <button type="button" disabled={busy} onClick={onConfirm} className={`${panelButton} bg-inverse text-on-inverse`}>
            Publish now
          </button>
        </div>
      </div>
    </div>
  );
}

type PanelName = "history" | "changes";

export default function EditBar() {
  const { editing, setEditing } = useEdit();
  const keys = [...useDraftKeys(), ...useRecordDraftNames()];
  const toast = useToast();
  const [panel, setPanel] = useState<PanelName | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<Change[] | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    void loadSiteDrafts();
    void loadRecordDrafts();
  }, []);

  // Escape closes the open panel and hands focus back to the button that opened it.
  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setPanel(null);
      opener.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panel]);

  function toggle(name: PanelName, button: HTMLButtonElement) {
    opener.current = button;
    setPanel(panel === name ? null : name);
  }

  // Turning Edit mode off tucks the panels away too.
  function switchEditing() {
    if (editing) setPanel(null);
    setEditing(!editing);
  }

  async function run(action: () => Promise<string | null>, success: string) {
    setBusy(true);
    showToast((await action()) ?? success);
    setBusy(false);
  }

  const tool = "inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm hover:bg-on-inverse/15 aria-pressed:bg-on-inverse/20";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex flex-col items-center gap-2 px-4">
      <div role="status" className="contents">
        {toast && (
          <p key={toast.id} className="edit-fade pointer-events-auto max-w-md rounded-full bg-inverse px-4 py-2 text-center text-sm text-on-inverse shadow-lg">
            {toast.text}
          </p>
        )}
      </div>
      {editing && panel === "history" && <HistoryPanel onClose={() => setPanel(null)} onRestored={() => setPanel("changes")} />}
      {editing && panel === "changes" && (
        <ChangesPanel
          keys={keys}
          busy={busy}
          onClose={() => setPanel(null)}
          onDiscard={() => void run(discardSiteDrafts, "Discarded. The page is back to what visitors see.")}
          onPublish={setConfirming}
        />
      )}
      {confirming && (
        <PublishDialog
          changes={confirming}
          busy={busy}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            setConfirming(null);
            void run(publishSiteDrafts, "Published. It's live now.");
          }}
        />
      )}
      <div
        role="toolbar"
        aria-label="Edit tools"
        className="pointer-events-auto flex flex-wrap items-center justify-center gap-1 rounded-full bg-inverse p-1 text-on-inverse shadow-xl"
      >
        <button type="button" role="switch" aria-label="Edit mode" aria-checked={editing} onClick={switchEditing} className={tool}>
          <span aria-hidden="true" className={`inline-block h-5 w-9 rounded-full p-0.5 ${editing ? "bg-draft" : "bg-on-inverse/30"}`}>
            <span className={`block size-4 rounded-full bg-inverse transition-transform motion-reduce:transition-none ${editing ? "translate-x-4" : ""}`} />
          </span>
          Edit
        </button>
        {editing && (
          <>
            <span aria-hidden="true" className="mx-1 h-5 w-px bg-on-inverse/30" />
            <button type="button" aria-pressed={panel === "history"} onClick={(e) => toggle("history", e.currentTarget)} className={tool}>
              History
            </button>
            <button type="button" aria-pressed={panel === "changes"} onClick={(e) => toggle("changes", e.currentTarget)} className={tool}>
              Changes
              {keys.length > 0 && (
                <span className="min-w-6 rounded-full bg-draft px-1.5 text-center text-xs font-semibold text-draft-foreground">
                  {keys.length}
                  <span className="sr-only"> unpublished</span>
                </span>
              )}
            </button>
          </>
        )}
        {keys.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void loadChanges().then(setConfirming)}
            className="inline-flex min-h-11 items-center rounded-full bg-on-inverse px-4 text-sm font-semibold text-inverse hover:opacity-90 disabled:opacity-60"
          >
            Publish ({keys.length})
          </button>
        )}
      </div>
    </div>
  );
}
