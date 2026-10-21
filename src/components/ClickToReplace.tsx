import { useRef, useState, type ReactNode } from "react";
import { ACCEPT_PHOTOS } from "@/components/Form";

// Edit mode only: puts a button over a picture so clicking it chooses a new file. `onPick` returns
// an error message, or null when the change was saved as a draft.
export default function ClickToReplace({
  label,
  round,
  onPick,
  children,
}: {
  label: string;
  round?: boolean; // for a round picture, so the button is round too
  onPick: (file: File) => Promise<string | null>;
  children: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function choose(file: File) {
    setBusy(true);
    setMessage(null);
    setMessage(await onPick(file));
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-1">
      <div className={`group/replace relative${round ? " overflow-hidden rounded-full" : ""}`}>
        {children}
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="absolute inset-0 flex items-center justify-center bg-black/0 text-sm font-medium text-white opacity-0 outline-offset-[-3px] transition hover:bg-black/50 hover:opacity-100 focus-visible:bg-black/50 focus-visible:opacity-100 disabled:opacity-100 disabled:bg-black/50"
        >
          <span className="rounded bg-black/70 px-3 py-2">{busy ? "Saving…" : label}</span>
        </button>
        <input
          ref={input}
          type="file"
          accept={ACCEPT_PHOTOS}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void choose(file);
          }}
        />
      </div>
      <p role="status" className="text-sm">
        {message}
      </p>
    </div>
  );
}
