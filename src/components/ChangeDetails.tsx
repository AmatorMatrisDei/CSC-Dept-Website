import { useEffect, useState } from "react";
import { type Change, getCurrentValues } from "@/lib/account";

// Shows what a change would set, and for updates what it replaces.
function show(value: unknown): string {
  if (value === null || value === undefined || value === "") return "(empty)";
  if (Array.isArray(value)) return value.length === 0 ? "(empty)" : value.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function ChangeDetails({ change, compare }: { change: Change; compare?: boolean }) {
  const [current, setCurrent] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!compare) return;
    let live = true;
    getCurrentValues(change).then((values) => {
      if (live) setCurrent(values);
    });
    return () => {
      live = false;
    };
  }, [change, compare]);

  const entries = Object.entries(change.proposed_data);
  if (entries.length === 0) return <p className="text-sm text-muted">No fields.</p>;

  return (
    <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="font-medium">{key.replaceAll("_", " ")}</dt>
          <dd className="break-words">
            {show(value)}
            {current && key in current && show(current[key]) !== show(value) && (
              <span className="block text-muted">was: {show(current[key])}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
