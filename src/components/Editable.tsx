import { type ElementType, type ReactNode, useRef, useState } from "react";
import { useEdit } from "@/lib/edit";

// Wraps a piece of text. For visitors it renders exactly as before. When an admin has Edit mode
// on, it gets an outline; click it to type right on the page. Enter (or clicking away) saves and
// Escape cancels. `multiline` fields use a text area, where Enter adds a new line and
// Ctrl+Enter saves. `onSave` returns an error message, or null when it worked.
export default function Editable({
  as: Tag = "span",
  value,
  onSave,
  label,
  multiline = false,
  maxLength,
  placeholder,
  drafted = false,
  className,
  children,
}: {
  as?: ElementType;
  value: string;
  onSave: (next: string) => Promise<string | null>;
  label: string;
  multiline?: boolean;
  maxLength?: number;
  placeholder?: string;
  drafted?: boolean; // has an unpublished change: shows an amber dot
  className?: string;
  children?: ReactNode;
}) {
  const { editing } = useEdit();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [message, setMessage] = useState<string | null>(null);
  const busy = useRef(false);

  if (!editing) return <Tag className={className}>{children ?? value}</Tag>;

  function begin() {
    setDraft(value);
    setMessage(null);
    setOpen(true);
  }

  async function save() {
    if (busy.current) return;
    if (draft === value) {
      setOpen(false);
      return;
    }
    busy.current = true;
    setMessage("Saving…");
    const error = await onSave(draft);
    busy.current = false;
    if (error) {
      setMessage(error);
      return;
    }
    setOpen(false);
    setMessage("Saved");
    window.setTimeout(() => setMessage(null), 2000);
  }

  function cancel() {
    busy.current = true;
    setOpen(false);
    setMessage(null);
    window.setTimeout(() => (busy.current = false), 0);
  }

  const field = "w-full rounded border border-accent bg-surface p-2 text-inherit";
  const hint = multiline ? "Ctrl+Enter to save, Esc to cancel" : "Enter to save, Esc to cancel";

  return (
    <div className="flex flex-col gap-1">
      {open ? (
        multiline ? (
          <textarea
            autoFocus
            aria-label={label}
            value={draft}
            rows={Math.min(16, Math.max(5, draft.split("\n").length + 1))}
            maxLength={maxLength}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void save()}
            onKeyDown={(e) => {
              if (e.key === "Escape") cancel();
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void save();
            }}
            className={field}
          />
        ) : (
          <input
            autoFocus
            aria-label={label}
            value={draft}
            maxLength={maxLength}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void save()}
            onKeyDown={(e) => {
              if (e.key === "Escape") cancel();
              if (e.key === "Enter") void save();
            }}
            className={field}
          />
        )
      ) : (
        <Tag
          role="button"
          tabIndex={0}
          aria-label={`Edit ${label}`}
          onClick={begin}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              begin();
            }
          }}
          className={`${className ?? ""} cursor-text rounded outline-2 outline-offset-4 outline-dashed outline-accent/60 hover:outline-accent`}
        >
          {children ?? (value || <span className="text-muted italic">{placeholder ?? `Add ${label}`}</span>)}
        </Tag>
      )}
      <span className="min-h-5 text-sm text-muted" role="status">
        {open && !message ? (
          hint
        ) : message ? (
          message
        ) : drafted ? (
          <>
            <span aria-hidden="true" className="mr-1.5 inline-block size-2.5 rounded-full bg-draft align-middle" />
            Unpublished change
          </>
        ) : null}
      </span>
    </div>
  );
}
