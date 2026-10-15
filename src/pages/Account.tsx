import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router";
import { Field } from "@/components/FormParts";
import {
  type Change,
  type MyProfile,
  type MyProject,
  getMyProfile,
  getMyProjects,
  getMySubmissions,
  withdrawSubmission,
} from "@/lib/account";
import { useAuth } from "@/lib/auth";
import { inputClass } from "@/lib/form";
import { useTitle } from "@/lib/hooks";

const primary = "min-h-11 rounded bg-accent px-5 py-2 font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60";
const EMAIL_PATTERN = "[^@\\s]+@([A-Za-z0-9-]+\\.)*franciscan\\.edu";

const STATUS_LABELS: Record<Change["status"], string> = {
  pending: "Waiting for review",
  approved: "Approved",
  rejected: "Not approved",
  changes_requested: "Sent back to you",
  withdrawn: "Withdrawn",
};

function SignedOut() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email")).trim();
    const password = String(data.get("password"));
    setBusy(true);
    setError(null);
    if (mode === "in") {
      setError(await signIn(email, password));
    } else {
      const result = await signUp(String(data.get("name")).trim(), email, password);
      setError(result.error);
      setSent(!result.error && result.needsConfirmation);
    }
    setBusy(false);
  }

  if (sent) {
    return (
      <p role="status" className="max-w-md rounded-lg border border-border bg-surface p-4">
        Check your Franciscan email for a confirmation link. Open it to finish creating your account.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex max-w-md flex-col gap-4">
      <p className="text-muted">
        {mode === "in"
          ? "Sign in to update your profile or suggest changes to a project."
          : "Use your Franciscan email. We will send a link to confirm it."}
      </p>
      {mode === "up" && (
        <Field label="Your name" htmlFor="name">
          <input id="name" name="name" required maxLength={100} autoComplete="name" className={inputClass} />
        </Field>
      )}
      <Field label="Franciscan email" htmlFor="email">
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          pattern={mode === "up" ? EMAIL_PATTERN : undefined}
          title={mode === "up" ? "Use your franciscan.edu email address" : undefined}
          className={inputClass}
        />
      </Field>
      <Field label="Password" htmlFor="password">
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={mode === "up" ? 8 : undefined}
          autoComplete={mode === "in" ? "current-password" : "new-password"}
          className={inputClass}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className={primary}>
          {busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode(mode === "in" ? "up" : "in");
            setError(null);
          }}
          className="min-h-11 underline"
        >
          {mode === "in" ? "Create an account" : "I already have an account"}
        </button>
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-border bg-surface p-3">
          {error}
        </p>
      )}
    </form>
  );
}

function Panel({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<MyProfile | null | undefined>(undefined);
  const [submissions, setSubmissions] = useState<Change[]>([]);
  const [projects, setProjects] = useState<MyProject[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    Promise.all([getMyProfile(userId), getMySubmissions(userId), getMyProjects(userId)])
      .then(([p, s, pr]) => {
        if (!live) return;
        setProfile(p);
        setSubmissions(s);
        setProjects(pr);
      })
      .catch(() => {
        if (!live) return;
        setError("Could not load your account. Please try again.");
        setProfile(null);
      });
    return () => {
      live = false;
    };
  }, [userId, version]);

  async function withdraw(id: string) {
    const message = await withdrawSubmission(id);
    if (message) setError(message);
    else setVersion((v) => v + 1);
  }

  if (profile === undefined) return <p className="text-muted">Loading…</p>;

  const listed = profile?.visible && profile.slug;

  return (
    <div className="flex flex-col gap-8">
      {error && <p role="alert">{error}</p>}

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">My profile</h2>
        <p>
          {listed ? (
            <>
              Your page is public:{" "}
              <Link to={`/students/${profile.slug}`} className="underline">
                view it
              </Link>
              .
            </>
          ) : (
            "You are not in the student list yet. Send a request and a reviewer will look at it."
          )}
        </p>
        <p>
          <Link to="/students/request" className="inline-flex min-h-11 items-center underline">
            {listed ? "Request changes to my profile" : "Request to be added"}
          </Link>
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">My projects</h2>
        {projects.length === 0 && <p className="text-muted">You are not on a project yet.</p>}
        <ul>
          {projects.map((p) => (
            <li key={p.slug} className="flex min-h-11 flex-wrap items-center gap-x-3">
              <Link to={`/projects/${p.slug}`} className="underline">
                {p.title}
              </Link>
              <span className="text-sm text-muted">{p.role}</span>
              {p.canEdit && p.confirmed && (
                <Link to={`/projects/${p.slug}/edit`} className="text-sm underline">
                  Request changes
                </Link>
              )}
            </li>
          ))}
        </ul>
        <p>
          <Link to="/projects/submit" className="inline-flex min-h-11 items-center underline">
            Submit a new project
          </Link>
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">My requests</h2>
        {submissions.length === 0 && <p className="text-muted">You have not sent any requests.</p>}
        <ul className="flex flex-col gap-3">
          {submissions.map((s) => (
            <li key={s.id} className="flex flex-col gap-1 rounded-lg border border-border p-3">
              <p className="font-medium">
                {s.action} {s.target_type}
                <span className="ml-2 text-sm font-normal text-muted">
                  {STATUS_LABELS[s.status]} · {new Date(s.created_at).toLocaleDateString()}
                </span>
              </p>
              {s.reason && <p className="text-sm">Reviewer note: {s.reason}</p>}
              {(s.status === "pending" || s.status === "changes_requested") && (
                <button type="button" onClick={() => void withdraw(s.id)} className="min-h-11 self-start text-sm underline">
                  Withdraw
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function Account() {
  useTitle("My account");
  const { ready, userId, email } = useAuth();

  if (!ready) return <p className="text-muted">Loading…</p>;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-3xl font-semibold">My account</h1>
      {userId ? (
        <>
          <p className="text-muted">Signed in as {email}.</p>
          <Panel userId={userId} />
        </>
      ) : (
        <SignedOut />
      )}
    </div>
  );
}
