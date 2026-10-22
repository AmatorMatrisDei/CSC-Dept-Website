import { useState } from "react";
import { useNavigate } from "react-router";
import Captcha from "@/components/Captcha";
import { Notice, TextField, buttonClass, secondaryButtonClass } from "@/components/Form";
import { EMAIL_PROBLEMS, finishReset, sendResetEmail, setPassword, useSession } from "@/lib/auth";
import { useAction, useTitle } from "@/lib/hooks";
import { useTurnstileToken } from "@/lib/turnstile";

// Signed out: reset a forgotten password through a link we email (see
// supabase/functions/_shared/account-email.ts). The person chooses the new password on the page
// that link opens, then types it here once more. Signed in: choose a new password.
export default function Password() {
  const session = useSession();
  useTitle("Password");
  if (session === undefined) return <p className="text-muted">Loading…</p>;
  return session ? <ChoosePassword /> : <ResetPassword />;
}

function ResetPassword() {
  const [email, setEmail] = useState("");
  const [password, setValue] = useState("");
  const [step, setStep] = useState<"ask" | "finish">("ask");
  const [problem, setProblem] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  const navigate = useNavigate();
  const captcha = useTurnstileToken();
  // Each try uses up the form's Turnstile token, so the next one gets a fresh check.
  const takeToken = () => {
    const token = captcha.token;
    captcha.renew();
    return token;
  };

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-3xl font-semibold">Reset your password</h1>
      {step === "ask" ? (
        <form
          className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-6"
          onSubmit={(e) => {
            e.preventDefault();
            setProblem(null);
            const token = takeToken();
            void run(async () => {
              const status = await sendResetEmail(email, token);
              if (status === "sent") setStep("finish");
              else setProblem(EMAIL_PROBLEMS[status] ?? "Something went wrong. Try again in a few minutes.");
            });
          }}
        >
          <TextField label="University email" type="email" required value={email} onChange={setEmail} autoComplete="email" />
          <Captcha key={captcha.round} onToken={captcha.setToken} />
          {problem && <Notice tone="error">{problem}</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" className={buttonClass} disabled={busy || !captcha.ready}>
              {busy ? "Sending…" : !captcha.ready ? "Checking you're a person…" : "Email me a reset link"}
            </button>
            <button type="button" className="inline-flex min-h-11 items-center underline" onClick={() => setStep("finish")}>
              I already chose a new password from your email
            </button>
          </div>
        </form>
      ) : (
        <>
          <Notice tone="info">
            <strong>Look in your Junk Email folder.</strong> If there&apos;s an account for {email || "that address"}, we&apos;ve
            sent it an email, and university mail almost always files it there.
          </Notice>
          <ol className="flex list-decimal flex-col gap-2 pl-6">
            <li>
              In Outlook, open <strong>Junk Email</strong>. The email&apos;s subject starts &ldquo;Reset your password&rdquo;,
              and it comes from an address ending in <strong>firebaseapp.com</strong> (Google&apos;s service that sends it
              for us).
            </li>
            <li>
              Open it and press <strong>It&apos;s not junk</strong> at the top. Outlook turns off links in junk mail until you
              do.
            </li>
            <li>Click the link within an hour, and choose a new password of at least 8 characters on the page it opens.</li>
            <li>Come back here and type that same password below.</li>
          </ol>
          <form
            className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-6"
            onSubmit={(e) => {
              e.preventDefault();
              setProblem(null);
              const token = takeToken();
              void run(async () => {
                const status = await finishReset(email, password, token);
                if (status === "done") {
                  navigate("/account/sign-in", { state: { message: "Your password has been changed. Sign in with it.", email } });
                } else if (status === "wrong_password") {
                  setProblem("That isn't the password you chose on the reset page. Check it, or ask for a new email.");
                } else if (status === "weak_password") {
                  setProblem("This site needs a longer password. Ask for a new email and choose one of at least 8 characters.");
                } else {
                  setProblem(EMAIL_PROBLEMS[status] ?? "Something went wrong. Try again in a few minutes.");
                }
              });
            }}
          >
            <TextField label="University email" type="email" required value={email} onChange={setEmail} autoComplete="email" />
            <TextField label="The new password you chose" type="password" required value={password} onChange={setValue}
              autoComplete="new-password" />
            <Captcha key={captcha.round} onToken={captcha.setToken} />
            {problem && <Notice tone="error">{problem}</Notice>}
            {error && <Notice tone="error">{error}</Notice>}
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={buttonClass} disabled={busy || !captcha.ready}>
                {busy ? "Saving…" : !captcha.ready ? "Checking you're a person…" : "Finish"}
              </button>
              <button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => setStep("ask")}>
                Ask for a new email
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

function ChoosePassword() {
  const [password, setValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const { busy, error, run, setError } = useAction();
  const navigate = useNavigate();

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="text-3xl font-semibold">Choose a new password</h1>
      <form
        className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (password !== confirm) {
            setError("The two passwords don't match.");
            return;
          }
          void run(async () => {
            await setPassword(password);
            navigate("/account", { state: { message: "Your password has been changed." } });
          });
        }}
      >
        <TextField label="New password" type="password" required value={password} onChange={setValue}
          autoComplete="new-password" hint="At least 8 characters." />
        <TextField label="New password again" type="password" required value={confirm} onChange={setConfirm}
          autoComplete="new-password" />
        {error && <Notice tone="error">{error}</Notice>}
        <button type="submit" className={`${buttonClass} w-fit`} disabled={busy}>
          {busy ? "Saving…" : "Save password"}
        </button>
      </form>
    </div>
  );
}
