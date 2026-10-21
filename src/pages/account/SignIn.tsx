import { useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { Notice, TextField, buttonClass } from "@/components/Form";
import { safeNext, signIn, signUp, useSession } from "@/lib/auth";
import { useAction, useTitle } from "@/lib/hooks";

// Sign in, or create an account. Only Franciscan University addresses can sign up; the database
// refuses anything else (see the before-user-created hook).
export default function SignIn() {
  const session = useSession();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<"sign-in" | "sign-up">(params.get("mode") === "sign-up" ? "sign-up" : "sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [checkEmail, setCheckEmail] = useState(false);
  const { busy, error, run, setError } = useAction();
  useTitle(mode === "sign-in" ? "Sign in" : "Create an account");

  if (session) return <Navigate to={next} replace />;

  if (checkEmail) {
    return (
      <div className="flex max-w-xl flex-col gap-4">
        <h1 className="text-3xl font-semibold">Check your email</h1>
        <p>
          We sent a link to <strong>{email}</strong>. Open it to confirm your address, then sign in. If it
          doesn&apos;t arrive in a few minutes, check your junk folder.
        </p>
      </div>
    );
  }

  const signingUp = mode === "sign-up";
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">{signingUp ? "Create an account" : "Sign in"}</h1>
        <p className="text-muted">
          Students sign in to add their profile, projects and internships to the site. Everything is checked by a
          reviewer before it appears.
        </p>
      </header>

      <form
        className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            if (signingUp) {
              if (await signUp(name, email, password)) setCheckEmail(true);
            } else {
              await signIn(email, password);
            }
          });
        }}
      >
        {signingUp && (
          <TextField label="Your name" required value={name} onChange={setName} autoComplete="name" maxLength={120}
            hint="As it should appear on the site." />
        )}
        <TextField
          label="University email"
          type="email"
          required
          value={email}
          onChange={setEmail}
          autoComplete="email"
          hint={signingUp ? "Your Franciscan University address. Other addresses can't sign up." : undefined}
        />
        <TextField
          label="Password"
          type="password"
          required
          value={password}
          onChange={setPassword}
          autoComplete={signingUp ? "new-password" : "current-password"}
          hint={signingUp ? "At least 8 characters. Don't reuse your university password." : undefined}
        />
        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" className={buttonClass} disabled={busy}>
            {busy ? "Please wait…" : signingUp ? "Create account" : "Sign in"}
          </button>
          {!signingUp && (
            <Link to="/account/password" className="inline-flex min-h-11 items-center underline">
              Forgot your password?
            </Link>
          )}
        </div>
        {signingUp && (
          <p className="text-sm text-muted">
            By creating an account you agree to the{" "}
            <Link to="/terms" className="underline">
              terms of use
            </Link>
            . The{" "}
            <Link to="/privacy" className="underline">
              privacy page
            </Link>{" "}
            explains what we keep and how to remove it.
          </p>
        )}
      </form>

      <p>
        {signingUp ? "Already have an account? " : "New here? "}
        <button
          type="button"
          className="inline-flex min-h-11 items-center underline"
          onClick={() => {
            setMode(signingUp ? "sign-in" : "sign-up");
            setError(null);
          }}
        >
          {signingUp ? "Sign in" : "Create an account"}
        </button>
      </p>
    </div>
  );
}
