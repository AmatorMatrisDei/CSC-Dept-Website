import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router";
import ChangeDetails from "@/components/ChangeDetails";
import { inputClass } from "@/lib/form";
import { type Change, getReviewQueue, reviewChange } from "@/lib/account";
import { useAuth } from "@/lib/auth";
import { useTitle } from "@/lib/hooks";

const button = "min-h-11 rounded border border-border px-4 py-2 font-medium hover:bg-surface disabled:opacity-60";

function ReviewItem({ change, reviewerId, onDone }: { change: Change; reviewerId: string; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const own = change.submitter_id === reviewerId;

  async function decide(decision: "approved" | "rejected" | "changes_requested") {
    if (decision !== "approved" && !note.trim()) {
      setError("Add a short note so the student knows why.");
      return;
    }
    setBusy(true);
    const message = await reviewChange(change.id, decision, note.trim());
    setBusy(false);
    if (message) setError(message);
    else onDone();
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <p className="font-medium">
        {change.submitter?.name ?? "Someone"} · {change.action} {change.target_type}
        <span className="ml-2 text-sm font-normal text-muted">{new Date(change.created_at).toLocaleDateString()}</span>
      </p>
      <ChangeDetails change={change} compare />
      {own ? (
        <p className="text-sm text-muted">This is your own request, so someone else needs to review it.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Note to the student (needed to send back or reject)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={inputClass} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void decide("approved")} className="min-h-11 rounded bg-accent px-4 py-2 font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60">
              Approve
            </button>
            <button type="button" disabled={busy} onClick={() => void decide("changes_requested")} className={button}>
              Send back
            </button>
            <button type="button" disabled={busy} onClick={() => void decide("rejected")} className={button}>
              Reject
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
    </li>
  );
}

// Reviewer home: the requests waiting for a decision.
export default function Admin() {
  useTitle("Review requests");
  const { ready, userId, email, role, isAdmin, isReviewer } = useAuth();
  const [queue, setQueue] = useState<Change[] | null | undefined>(undefined);

  const load = useCallback(() => {
    getReviewQueue()
      .then(setQueue)
      .catch(() => setQueue(null));
  }, []);

  useEffect(() => {
    if (isReviewer) load();
  }, [isReviewer, load]);

  if (!ready) return <p className="text-muted">Loading…</p>;
  if (!email) return <Navigate to="/admin/login" replace />;
  if (role === null) return <p className="text-muted">Loading…</p>; // role is still being looked up
  if (!isReviewer) return <Navigate to="/account" replace />;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-3xl font-semibold">Review requests</h1>
      {isAdmin && (
        <p className="text-sm text-muted">
          To change page text directly, turn on <strong>Edit mode</strong> in the header and click the text. Try a{" "}
          <Link to="/projects" className="underline">
            project
          </Link>
          .
        </p>
      )}
      {queue === undefined && <p className="text-muted">Loading…</p>}
      {queue === null && <p role="alert">Could not load the requests. Please try again.</p>}
      {queue && queue.length === 0 && <p>Nothing is waiting. All caught up.</p>}
      {queue && queue.length > 0 && (
        <ul className="flex flex-col gap-4">
          {queue.map((change) => (
            <ReviewItem key={change.id} change={change} reviewerId={userId ?? ""} onDone={load} />
          ))}
        </ul>
      )}
    </div>
  );
}
