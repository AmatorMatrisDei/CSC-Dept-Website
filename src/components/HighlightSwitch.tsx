import { useState } from "react";
import { Notice, fieldClass, secondaryButtonClass } from "@/components/Form";
import { getHighlightState, setHighlight, type HighlightKind } from "@/lib/highlights";
import { useAction, useReloadable } from "@/lib/hooks";

// Edit mode only, small and in the top right of the page so an editor sees it at once: put this
// page's project, student or alumni story in the pool the home page picks from. Unlike text edits
// it is live at once, with no draft step; the database refuses anyone who may not (and a student
// who is not listed in the directory). It has no heading, so the page's h1 stays first.
const NOUN: Record<HighlightKind, string> = { project: "project", student: "student", alumni: "story" };

export default function HighlightSwitch({ kind, refId }: { kind: HighlightKind; refId: string }) {
  const [state, reload] = useReloadable(getHighlightState, kind, refId);
  const { busy, error, run } = useAction();
  const [lineOpen, setLineOpen] = useState(false);

  if (!state) return null;
  const hint = `The home page shows a few highlighted ${NOUN[kind]}s, a different few each day. This is live at once, not part of the draft.`;
  return (
    <section aria-label="Home page highlight" className="flex w-full flex-col items-start gap-1 sm:w-auto sm:max-w-sm sm:items-end">
      <label
        title={hint}
        className={`inline-flex min-h-11 items-center gap-2 rounded-full border border-accent px-4 text-sm ${state.on ? "bg-accent/15 font-semibold" : ""}`}
      >
        <input
          type="checkbox"
          className="size-4"
          checked={state.on}
          disabled={busy}
          aria-describedby={`highlight-hint-${refId}`}
          onChange={(e) => void run(async () => { await setHighlight(kind, refId, e.target.checked, state.blurb); reload(); })}
        />
        <span>{state.on ? "On the home page" : "Highlight on the home page"}</span>
      </label>
      <span id={`highlight-hint-${refId}`} className="sr-only">
        {hint}
      </span>
      {state.on && (
        <button type="button" className="inline-flex min-h-11 items-center text-sm underline" aria-expanded={lineOpen} onClick={() => setLineOpen(!lineOpen)}>
          {state.blurb ? "Edit its line" : "Add a line"}
        </button>
      )}
      {state.on && lineOpen && (
        <Quote key={state.blurb} blurb={state.blurb} busy={busy} onSave={(blurb) => run(async () => { await setHighlight(kind, refId, true, blurb); reload(); })} />
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </section>
  );
}

function Quote({ blurb, busy, onSave }: { blurb: string; busy: boolean; onSave: (blurb: string) => Promise<void> }) {
  const [text, setText] = useState(blurb);
  return (
    <form
      className="flex w-full flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(text);
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="text-sm">One line shown on the card (optional, up to 200 characters)</span>
        <input className={fieldClass} value={text} maxLength={200} onChange={(e) => setText(e.target.value)} />
      </label>
      <button type="submit" className={secondaryButtonClass} disabled={busy || text.trim() === blurb}>
        Save line
      </button>
    </form>
  );
}
