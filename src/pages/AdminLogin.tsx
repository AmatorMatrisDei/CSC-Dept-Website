import { type FormEvent, useState } from "react";
import { Navigate } from "react-router";
import { Field } from "@/components/FormParts";
import { useAuth } from "@/lib/auth";
import { inputClass } from "@/lib/form";
import { useTitle } from "@/lib/hooks";

// Staff sign-in. Not linked from the public pages.
export default function AdminLogin() {
  useTitle("Staff sign-in");
  const { email, signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (email) return <Navigate to="/admin" replace />;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError(await signIn(String(data.get("email")), String(data.get("password"))));
    setBusy(false);
  }

  return (
    <div className="flex max-w-md flex-col gap-6">
      <h1 className="text-3xl font-semibold">Staff sign-in</h1>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Email" htmlFor="email">
          <input id="email" name="email" type="email" required autoComplete="username" className={inputClass} />
        </Field>
        <Field label="Password" htmlFor="password">
          <input id="password" name="password" type="password" required autoComplete="current-password" className={inputClass} />
        </Field>
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 self-start rounded bg-accent px-5 py-2 font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
        {error && (
          <p role="alert" className="rounded-lg border border-border bg-surface p-3">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
