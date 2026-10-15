import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { Notice, buttonClass, secondaryButtonClass } from "@/components/Form";
import {
  OPEN_STATUSES,
  STATUS_LABELS,
  describeSubmission,
  getDashboard,
  getMyRole,
  respondToListing,
  submitChange,
  withdrawChange,
  type ConsentScope,
  type Submission,
} from "@/lib/account";
import { signOut, useSignedInSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { useAction, useAsync, useTitle } from "@/lib/hooks";

const SCOPE_LABELS: Record<ConsentScope, string> = {
  directory: "Be listed in the directory",
  photo: "Show my photo",
  email: "Show my email address",
  phone: "Show my phone number",
};

// Where a returned submission is edited and sent back.
function editLink(s: Submission): string | null {
  if (s.action === "delete") return null;
  const base = {
    profile: "/account/profile",
    project: s.action === "create" ? "/account/projects/new" : `/account/projects/${s.target_id}`,
    internship: s.action === "create" ? "/account/internships/new" : `/account/internships/${s.target_id}`,
  }[s.target_type];
  return `${base}?change=${s.id}`;
}

function Card({ title, id, children, action }: { title: string; id: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="text-xl font-semibold">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function Dashboard() {
  const session = useSignedInSession();
  const [version, setVersion] = useState(0);
  const data = useAsync(getDashboard, session.user.id, version);
  const role = useAsync(getMyRole, session.user.id);
  const location = useLocation();
  const flash = (location.state as { message?: string } | null)?.message;
  const { busy, error, run } = useAction();
  useTitle("My account");

  if (!data) return <p className="text-muted">Loading…</p>;

  const { me, consents, submissions, projects, listings, internships } = data;
  const reload = () => setVersion((v) => v + 1);
  const act = (action: () => Promise<void>) => run(async () => {
    await action();
    reload();
  });
  const open = submissions.filter((s) => OPEN_STATUSES.includes(s.status));
  const returned = submissions.filter((s) => s.status === "changes_requested");
  const titles: Record<string, string> = Object.fromEntries([
    ...projects.map((p) => [p.id, p.title]),
    ...internships.map((i) => [i.id, i.company]),
  ]);
  const listed = me.visible && consents.includes("directory");
  const waitingToBeAdded = open.some((s) => s.target_type === "profile" && s.action === "create");
  const removalRequested = open.some((s) => s.target_type === "profile" && s.action === "delete");
  const isReviewer = role && role.role !== "student";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">My account</h1>
        <p className="text-muted">
          Signed in as {me.name} ({session.user.email})
        </p>
        <div className="flex flex-wrap gap-2">
          {isReviewer && (
            <Link to="/review" className={buttonClass}>
              Review submissions
            </Link>
          )}
          <Link to="/account/password" className={secondaryButtonClass}>
            Change password
          </Link>
          <button type="button" className={secondaryButtonClass} onClick={() => void run(signOut)}>
            Sign out
          </button>
        </div>
      </header>

      {flash && <Notice tone="success">{flash}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      {(listings.length > 0 || returned.length > 0) && (
        <Card title="Needs your attention" id="attention">
          <ul className="flex flex-col gap-3">
            {listings.map((l) => (
              <li key={l.id} className="flex flex-col gap-2 border-t border-border pt-3 first:border-0 first:pt-0">
                <p>
                  You were added to <strong>{l.project.title}</strong> as <strong>{l.role}</strong>. Your name only
                  appears on the project once you confirm.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={buttonClass} disabled={busy}
                    onClick={() => void act(() => respondToListing(l.id, true))}>
                    Confirm
                  </button>
                  <button type="button" className={secondaryButtonClass} disabled={busy}
                    onClick={() => void act(() => respondToListing(l.id, false))}>
                    That&apos;s not me
                  </button>
                </div>
              </li>
            ))}
            {returned.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 border-t border-border pt-3 first:border-0 first:pt-0">
                <p>
                  A reviewer asked for changes to <strong>{describeSubmission(s, titles)}</strong>:
                </p>
                <blockquote className="border-l-4 border-highlight pl-3">{s.reason}</blockquote>
                {editLink(s) && (
                  <Link to={editLink(s)!} className={`${buttonClass} w-fit`}>
                    Edit and send back
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Directory profile" id="profile">
        {listed ? (
          <p>
            You&apos;re listed in the student directory.{" "}
            <Link to={`/students/${me.slug}`} className="inline-flex min-h-11 items-center underline">
              View your public page
            </Link>
          </p>
        ) : removalRequested ? (
          <p>You asked to be removed. Your profile is hidden while a reviewer finishes the removal.</p>
        ) : waitingToBeAdded ? (
          <p>Your request to be added is waiting for review.</p>
        ) : (
          <p>You&apos;re not in the directory. Students appear only if they ask to be added (opt-in).</p>
        )}
        <p className="text-sm text-muted">
          You&apos;ve agreed to:{" "}
          {consents.length ? consents.map((c) => SCOPE_LABELS[c].toLowerCase()).join(", ") : "nothing yet"}.
        </p>
        <div className="flex flex-wrap gap-2">
          {!waitingToBeAdded && !removalRequested && (
            <Link to="/account/profile" className={buttonClass}>
              {listed ? "Edit my profile" : "Request to be added"}
            </Link>
          )}
          <Link to="/account/profile#permissions" className={secondaryButtonClass}>
            Manage permissions
          </Link>
          {listed && !removalRequested && (
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={busy}
              onClick={() => {
                if (window.confirm("Remove yourself from the directory? Your profile is hidden straight away, and a reviewer then removes it, along with your project listings and internships.")) {
                  void act(async () => {
                    await submitChange({ target_type: "profile", action: "delete" });
                  });
                }
              }}
            >
              Remove me from the directory
            </button>
          )}
        </div>
      </Card>

      <Card
        title="My projects"
        id="projects"
        action={<Link to="/account/projects/new" className={buttonClass}>Submit a new project</Link>}
      >
        {projects.length === 0 ? (
          <p className="text-muted">No projects yet. Submit one, or ask a teammate to add you to theirs.</p>
        ) : (
          <ul className="flex flex-col">
            {projects.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 border-t border-border py-2 first:border-0">
                {p.published ? (
                  <Link to={`/projects/${p.slug}`} className="inline-flex min-h-11 items-center font-medium underline">
                    {p.title}
                  </Link>
                ) : (
                  <span className="inline-flex min-h-11 items-center font-medium">{p.title} (not public)</span>
                )}
                {p.role && <span className="text-sm text-muted">{p.role}</span>}
                {p.canEdit && (
                  <Link to={`/account/projects/${p.id}`} className="ml-auto inline-flex min-h-11 items-center underline">
                    Suggest changes
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="Internships"
        id="internships"
        action={<Link to="/account/internships/new" className={buttonClass}>Add an internship</Link>}
      >
        <p className="text-sm text-muted">Internships show on your profile while you&apos;re in the directory.</p>
        {internships.length === 0 ? (
          <p className="text-muted">No internships yet.</p>
        ) : (
          <ul className="flex flex-col">
            {internships.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-x-3 border-t border-border py-2 first:border-0">
                <span className="font-medium">{i.company}</span>
                {i.term && <span className="text-sm text-muted">{i.term}</span>}
                <span className="ml-auto flex gap-3">
                  <Link to={`/account/internships/${i.id}`} className="inline-flex min-h-11 items-center underline">
                    Edit
                  </Link>
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center underline"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`Ask to remove ${i.company} from your internships?`)) {
                        void act(async () => {
                          await submitChange({ target_type: "internship", action: "delete", target_id: i.id });
                        });
                      }
                    }}
                  >
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="My submissions" id="submissions">
        <p className="text-sm text-muted">
          Nothing you send appears on the site until a reviewer approves it. You can withdraw anything still waiting.
        </p>
        {submissions.length === 0 ? (
          <p className="text-muted">Nothing submitted yet.</p>
        ) : (
          <ul className="flex flex-col">
            {submissions.map((s) => (
              <li key={s.id} className="flex flex-col gap-1 border-t border-border py-3 first:border-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium">{describeSubmission(s, titles)}</span>
                  <span className="rounded border border-border px-2 py-0.5 text-sm">{STATUS_LABELS[s.status]}</span>
                  <span className="text-sm text-muted">Sent {formatDate(s.created_at)}</span>
                </div>
                {s.reason && <p className="text-sm">Reviewer&apos;s note: {s.reason}</p>}
                {OPEN_STATUSES.includes(s.status) && (
                  <div className="flex flex-wrap gap-3">
                    {s.status === "changes_requested" && editLink(s) && (
                      <Link to={editLink(s)!} className="inline-flex min-h-11 items-center underline">
                        Edit and send back
                      </Link>
                    )}
                    {/* A removal hides the profile as soon as it is sent, so withdrawing it would change nothing. */}
                    {!(s.target_type === "profile" && s.action === "delete") && (
                      <button
                        type="button"
                        className="inline-flex min-h-11 items-center underline"
                        disabled={busy}
                        onClick={() => void act(() => withdrawChange(s.id))}
                      >
                        Withdraw
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
