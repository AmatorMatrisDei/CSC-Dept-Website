import { useId, useState } from "react";
import { Notice, fieldClass, secondaryButtonClass } from "@/components/Form";
import { getHighlightState, setHighlight, type HighlightKind } from "@/lib/highlights";
import { useAction, useReloadable } from "@/lib/hooks";

// Edit mode only: put this page's project, student or alumni story in the pool the home page picks
// from. Unlike text edits it is live at once, with no draft step; the database refuses anyone who
// may not (and a student who is not listed in the directory).
const NOUN: Record<HighlightKind, string> = { project: "project", student: "student", alumni: "story" };

export default function HighlightSwitch({ kind, refId }: { kind: HighlightKind; refId: string }) {
  const headingId = useId();
  const [state, reload] = useReloadable(getHighlightState, kind, refId);
  const { busy, error, run } = useAction();

  if (!state) return null;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded border border-dashed border-accent/60 p-4">
      <h2 id={headingId} className="text-xl font-semibold">
        Home page highlight
      </h2>
      <label className="inline-flex min-h-11 w-fit items-center gap-3">
        <input
          type="checkbox"
          className="size-5"
          checked={state.on}
          disabled={busy}
          onChange={(e) => void run(async () => { await setHighlight(kind, refId, e.target.checked, state.blurb); reload(); })}
        />
        <span>Highlight this {NOUN[kind]} on the home page</span>
      </label>
      <p className="text-sm text-muted">
        The home page shows a few highlighted {NOUN[kind]}s, a different few each day. This takes effect straight away; it is not part of the draft.
      </p>
      {state.on && <Quote key={state.blurb} blurb={state.blurb} busy={busy} onSave={(blurb) => run(async () => { await setHighlight(kind, refId, true, blurb); reload(); })} />}
      {error && <Notice tone="error">{error}</Notice>}
    </section>
  );
}

function Quote({ blurb, busy, onSave }: { blurb: string; busy: boolean; onSave: (blurb: string) => Promise<void> }) {
  const [text, setText] = useState(blurb);
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(text);
      }}
    >
      <label className="flex flex-1 flex-col gap-1">
        <span className="text-sm">One line shown on the card (optional, up to 200 characters)</span>
        <input className={fieldClass} value={text} maxLength={200} onChange={(e) => setText(e.target.value)} />
      </label>
      <button type="submit" className={secondaryButtonClass} disabled={busy || text.trim() === blurb}>
        Save line
      </button>
    </form>
  );
}
