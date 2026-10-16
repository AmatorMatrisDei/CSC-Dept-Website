import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import Portrait from "@/components/Portrait";
import type { QuickInfo } from "@/lib/quickInfo";


// A profile picture that opens a small card with the person's name and quick facts. It uses the
// browser's <dialog>, so focus moves into it, Escape closes it, and the rest of the page waits.
// It sits above a card's link overlay (`relative z-10`), so clicking the picture opens the card
// instead of following the link. The card's contents exist only while it is open, so the page
// doesn't carry a hidden second copy of the person's details.
export default function QuickView({ person, className = "size-16" }: { person: QuickInfo; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const links = person.links ?? [];

  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Quick look at ${person.name}`}
        className="relative z-10 shrink-0 cursor-zoom-in rounded-full"
      >
        <Portrait src={person.photo?.url} alt={person.photo?.alt ?? ""} name={person.name} className={className} />
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close(); // a click on the backdrop
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-lg border border-border bg-surface p-0 text-foreground shadow-xl backdrop:bg-black/50"
      >
        {open && (
        <div className="flex flex-col items-center gap-3 p-6 text-center">
          {person.photo ? (
            <img src={person.photo.url} alt={person.photo.alt} className="size-40 rounded-full object-cover" />
          ) : (
            <Portrait name={person.name} alt="" className="size-40 text-4xl" />
          )}
          <h2 id={titleId} className="text-xl font-semibold">
            {person.name}
          </h2>
          {person.subtitle && <p className="text-muted">{person.subtitle}</p>}
          {person.details?.filter(Boolean).map((line) => (
            <p key={line} className="text-sm">
              {line}
            </p>
          ))}
          {(person.email || person.phone || links.length > 0) && (
            <div className="flex flex-wrap justify-center gap-x-4 text-sm">
              {person.email && (
                <a href={`mailto:${person.email}`} className="inline-flex min-h-11 items-center underline">
                  {person.email}
                </a>
              )}
              {person.phone && (
                <a href={`tel:${person.phone.replace(/[^\d+]/g, "")}`} className="inline-flex min-h-11 items-center underline">
                  {person.phone}
                </a>
              )}
              {links.map((l) => (
                <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">
                  {l.label}
                </a>
              ))}
            </div>
          )}
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {person.href && (
              <Link
                to={person.href}
                onClick={() => dialog.current?.close()}
                className="inline-flex min-h-11 items-center rounded bg-accent px-4 font-medium text-accent-foreground hover:opacity-90"
              >
                Full profile
              </Link>
            )}
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="inline-flex min-h-11 items-center rounded border border-border px-4 hover:bg-background"
            >
              Close
            </button>
          </div>
        </div>
        )}
      </dialog>
    </>
  );
}
