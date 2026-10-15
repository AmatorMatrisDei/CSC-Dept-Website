import { Link, useLocation, useSearchParams } from "react-router";
import { Notice } from "@/components/Form";
import { STATUS_LABELS, describeSubmission } from "@/lib/account";
import { formatDate } from "@/lib/format";
import { useAsync, useTitle } from "@/lib/hooks";
import { getQueue } from "@/lib/review";

// The review queue (FR-3.4): every submission waiting for a reviewer, oldest first, and the latest
// decisions.
export default function ReviewQueue() {
  const [params] = useSearchParams();
  const view = params.get("view") === "decided" ? "decided" : "waiting";
  const queue = useAsync(getQueue, view);
  const location = useLocation();
  const flash = (location.state as { message?: string } | null)?.message;
  useTitle("Review submissions");

  const tab = (name: "waiting" | "decided", label: string) => (
    <Link
      to={name === "waiting" ? "/review" : "/review?view=decided"}
      aria-current={view === name ? "page" : undefined}
      className={`inline-flex min-h-11 items-center rounded px-4 ${view === name ? "bg-accent text-accent-foreground" : "border border-border hover:bg-surface"}`}
    >
      {label}
    </Link>
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link to="/account" className="inline-flex min-h-11 w-fit items-center text-sm underline">
          My account
        </Link>
        <h1 className="text-3xl font-semibold">Review submissions</h1>
        <p className="text-muted">
          Students&apos; profiles, projects and internships appear on the site only after a reviewer approves them.
          Check for accuracy, appropriate photos with alt text, and nothing from an education record (grades, ID
          numbers, schedules).
        </p>
      </header>

      {flash && <Notice tone="success">{flash}</Notice>}

      <nav aria-label="Submissions" className="flex flex-wrap gap-2">
        {tab("waiting", "Waiting for review")}
        {tab("decided", "Recent decisions")}
      </nav>

      {!queue ? (
        <p className="text-muted">Loading…</p>
      ) : queue.items.length === 0 ? (
        <p className="text-muted">{view === "waiting" ? "Nothing is waiting for review." : "No decisions yet."}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {queue.items.map((s) => (
            <li key={s.id} className="lift relative flex flex-col gap-1 rounded-lg border border-border bg-surface p-4">
              <Link to={`/review/${s.id}`} className="font-medium underline after:absolute after:inset-0">
                {describeSubmission(s, queue.titles)}
              </Link>
              <p className="text-sm text-muted">
                From {s.submitter?.name ?? "a removed account"} · sent {formatDate(s.created_at)}
                {view === "decided" && s.reviewed_at && (
                  <>
                    {" "}· {STATUS_LABELS[s.status]} by {s.reviewer?.name ?? "a reviewer"} on {formatDate(s.reviewed_at)}
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
