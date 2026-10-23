import { useState } from "react";
import { useAction } from "@/lib/hooks";
import { LIVE_SAVED, showToast } from "@/lib/toast";
import { universityToday } from "@/lib/eventDates";
import { deleteEvent, eventProblem, IMPORTANCE_LABELS, saveEvent, type EventInput, type Importance } from "@/lib/events";
import { eventPrompt, parseEventPaste } from "@/lib/eventPaste";
import { buttonClass, Notice, SelectField, secondaryButtonClass, TextArea, TextField } from "./Form";

// Adds or changes one event (`id` is null for a new one). It saves at once: there is no draft.
export default function EventForm({
  id,
  initial,
  departments,
  onDone,
  onCancel,
}: {
  id: string | null;
  initial: EventInput;
  departments: { id: string; name: string }[];
  onDone: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [input, setInput] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pasted, setPasted] = useState("");
  const [pasteResult, setPasteResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const { busy, error, run } = useAction();
  const set = (key: keyof EventInput) => (value: string) => setInput((prev) => ({ ...prev, [key]: value }));

  return (
    <form
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-6"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const issue = eventProblem(input);
        setProblem(issue);
        if (!issue) {
          run(async () => {
            await saveEvent(id, input);
            await onDone();
            showToast(LIVE_SAVED);
          });
        }
      }}
    >
      <h2 className="text-xl font-semibold">{id ? "Edit event" : "Add an event"}</h2>
      <details className="rounded border border-border p-3">
        <summary className="min-h-11 cursor-pointer py-2 font-medium">Fill in from an AI's answer (optional)</summary>
        <div className="flex flex-col gap-3 pt-2">
          <p className="text-sm text-muted">
            Copy the instructions, give them to any AI chatbot together with a description of the event, then paste its answer
            here. The form is filled in for you to check; nothing is saved until you press the save button.
          </p>
          <div>
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={async () => {
                const areas = departments.map((d) => d.name);
                try {
                  await navigator.clipboard.writeText(eventPrompt(universityToday(), areas));
                  setPasteResult({ tone: "success", text: "Instructions copied. Paste them into an AI chat, then add your event after them." });
                } catch {
                  setPasteResult({ tone: "error", text: "Your browser would not copy. Fill in the form by hand instead." });
                }
              }}
            >
              Copy instructions for an AI
            </button>
          </div>
          <TextArea label="The AI's answer" value={pasted} onChange={setPasted} rows={5} />
          <div>
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={!pasted.trim()}
              onClick={() => {
                const result = parseEventPaste(pasted, departments);
                if ("problem" in result) {
                  setPasteResult({ tone: "error", text: result.problem });
                  return;
                }
                setInput(result.input);
                setProblem(null);
                setPasteResult({
                  tone: "success",
                  text: ["Form filled in. Check it below before saving.", ...result.notes].join(" "),
                });
              }}
            >
              Fill in the form
            </button>
          </div>
          {pasteResult && <Notice tone={pasteResult.tone}>{pasteResult.text}</Notice>}
        </div>
      </details>
      <TextField label="Title" required value={input.title} onChange={set("title")} maxLength={200} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Date" type="date" required value={input.event_date} onChange={set("event_date")} />
        <TextField
          label="Last day"
          type="date"
          value={input.end_date}
          onChange={set("end_date")}
          min={input.event_date || undefined}
          hint="Only for events that last more than one day."
        />
        <TextField label="Starts" type="time" value={input.start_time} onChange={set("start_time")} hint="Leave empty for an all-day event." />
        <TextField label="Ends" type="time" value={input.end_time} onChange={set("end_time")} />
      </div>
      <TextField label="Place" value={input.place} onChange={set("place")} maxLength={200} />
      <TextField
        label="Link"
        type="url"
        value={input.link_url}
        onChange={set("link_url")}
        maxLength={270}
        hint="Optional: a page with more details or a sign-up. Starts with https://"
      />
      <TextArea label="Description" value={input.description} onChange={set("description")} maxLength={2000} rows={4} />
      <SelectField
        label="Area"
        value={input.sub_department_id}
        onChange={set("sub_department_id")}
        options={departments.map((d) => ({ value: d.id, label: d.name }))}
        placeholder="Whole department"
      />
      <SelectField
        label="Importance"
        required
        value={input.importance}
        onChange={(value) => setInput((prev) => ({ ...prev, importance: value as Importance }))}
        options={(Object.keys(IMPORTANCE_LABELS) as Importance[]).map((value) => ({ value, label: IMPORTANCE_LABELS[value] }))}
        hint="Major events lead the home page. Minor ones are only for filtering."
      />
      {(problem || error) && <Notice tone="error">{problem ?? error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={buttonClass} disabled={busy}>
          {busy ? "Saving…" : id ? "Save event" : "Add event"}
        </button>
        <button type="button" className={secondaryButtonClass} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        {id && !confirmDelete && (
          <button type="button" className={secondaryButtonClass} onClick={() => setConfirmDelete(true)} disabled={busy}>
            Delete…
          </button>
        )}
      </div>
      {id && confirmDelete && (
        <Notice>
          <p className="mb-2">Delete this event for good? Visitors will no longer see it.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await deleteEvent(id);
                  await onDone();
                })
              }
            >
              Yes, delete it
            </button>
            <button type="button" className={secondaryButtonClass} onClick={() => setConfirmDelete(false)}>
              Keep it
            </button>
          </div>
        </Notice>
      )}
    </form>
  );
}
