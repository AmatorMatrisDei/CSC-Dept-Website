import { useState } from "react";
import { Link } from "react-router";
import { Notice, buttonClass, secondaryButtonClass } from "@/components/Form";
import {
  EMAIL_PROBLEMS,
  checkVerificationEmail,
  type EmailStatus,
  sendVerificationEmail,
  signInWithProvider,
  useSignedInSession,
  useVerification,
} from "@/lib/auth";
import { useAction, useTitle } from "@/lib/hooks";

const METHODS = { google: "your Google sign-in", github: "your GitHub sign-in", email: "the link we emailed you", admin: "the site team" };

// Proving the account's address is the person's own: a link we email (it usually lands in Junk),
// or a Google or GitHub sign-in with the same address. Until then the database refuses
// submissions, permissions and reviews.
export default function VerifyEmail() {
  const session = useSignedInSession();
  const verification = useVerification(session.user.id);
  const [sent, setSent] = useState(false);
  const [answer, setAnswer] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const { busy, error, run } = useAction();
  useTitle("Verify your email");

  if (verification === undefined) return <p className="text-muted">Loading…</p>;

  if (verification.verified) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <h1 className="text-3xl font-semibold">Your email address is verified</h1>
        <p>
          {session.user.email} was verified through {verification.method ? METHODS[verification.method] : "the site"}. You
          can add your profile, projects and internships.
        </p>
        <Link to="/account" className={`${buttonClass} w-fit`}>
          Go to my account
        </Link>
      </div>
    );
  }

  function explain(status: EmailStatus) {
    if (status === "sent") {
      setSent(true);
      setAnswer(null);
    } else if (status === "not_yet") {
      setAnswer({ tone: "info", text: "The link hasn't been clicked yet. Follow the steps above, then try again." });
    } else if (status === "send_first") {
      setSent(false);
      setAnswer({ tone: "info", text: "Send yourself a new email first; links from more than three days ago, or from an earlier email, no longer count." });
    } else if (status !== "verified") {
      setAnswer({ tone: "error", text: EMAIL_PROBLEMS[status] ?? "Something went wrong. Try again in a few minutes." });
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Verify your email address</h1>
        <p>
          Before you add your profile, projects or internships, we need to know that <strong>{session.user.email}</strong> is
          yours. Until then you can look around and use the planner.
        </p>
      </header>

      <section aria-labelledby="by-email" className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-6">
        <h2 id="by-email" className="text-2xl font-semibold">Get a link by email</h2>
        {sent ? (
          <>
            <Notice tone="info">
              <strong>Look in your Junk Email folder.</strong> University mail almost always files this email there.
            </Notice>
            <ol className="flex list-decimal flex-col gap-2 pl-6">
              <li>
                In Outlook, open <strong>Junk Email</strong>. The email&apos;s subject starts &ldquo;Verify your
                email&rdquo;, and it comes from an address ending in <strong>firebaseapp.com</strong> (Google&apos;s
                service that sends it for us).
              </li>
              <li>
                Open it and press <strong>It&apos;s not junk</strong> at the top. Outlook turns off links in junk mail
                until you do.
              </li>
              <li>Click the link in the email. A page opens saying your email has been verified.</li>
              <li>Come back here and press &ldquo;I&apos;ve clicked the link&rdquo;.</li>
            </ol>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={buttonClass} disabled={busy}
                onClick={() => void run(async () => explain(await checkVerificationEmail()))}>
                {busy ? "Checking…" : "I've clicked the link"}
              </button>
              <button type="button" className={secondaryButtonClass} disabled={busy}
                onClick={() => void run(async () => explain(await sendVerificationEmail()))}>
                Send another email
              </button>
            </div>
            <p className="text-sm text-muted">A new email replaces the last one: use the link in the newest.</p>
          </>
        ) : (
          <>
            <p>We&apos;ll email {session.user.email} a link. It takes a minute and usually lands in your Junk Email folder.</p>
            <button type="button" className={`${buttonClass} w-fit`} disabled={busy}
              onClick={() => void run(async () => explain(await sendVerificationEmail()))}>
              {busy ? "Sending…" : "Send the email"}
            </button>
          </>
        )}
        {answer && <Notice tone={answer.tone}>{answer.text}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
      </section>

      <section aria-labelledby="by-provider" className="flex flex-col gap-3">
        <h2 id="by-provider" className="text-2xl font-semibold">Or sign in with Google or GitHub</h2>
        <p>
          If you have a Google account made with your Franciscan address (not a Gmail address), or a GitHub account with it
          as the primary email, signing in with it verifies you at once. The password this account has stops working, in case someone else chose it; you can set a new
          one afterwards.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondaryButtonClass} disabled={busy}
            onClick={() => void run(() => signInWithProvider("google", "/account/verify"))}>
            Continue with Google
          </button>
          <button type="button" className={secondaryButtonClass} disabled={busy}
            onClick={() => void run(() => signInWithProvider("github", "/account/verify"))}>
            Continue with GitHub
          </button>
        </div>
      </section>

      <p className="text-sm text-muted">
        Neither works for you? Email franciscan.eac@gmail.com from your university address and the team will verify you by hand.
      </p>
    </div>
  );
}
