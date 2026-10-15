import { useState } from "react";
import { useNavigate } from "react-router";
import { Notice, TextField, buttonClass } from "@/components/Form";
import { sendPasswordReset, setPassword, useSession } from "@/lib/auth";
import { useAction, useTitle } from "@/lib/hooks";

// Signed out: ask for a reset link. Signed in, including from the link in that email: choose a
// new password.
export default function Password() {
  const session = useSession();
  useTitle("Password");
  if (session === undefined) return <p className="text-muted">Loading…</p>;
  return session ? <ChoosePassword /> : <RequestReset />;
}

function RequestReset() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useAction();

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="text-3xl font-semibold">Reset your password</h1>
      {sent ? (
        <Notice tone="success">
          If there&apos;s an account for <strong>{email}</strong>, we&apos;ve sent it a link to choose a new
          password.
        </Notice>
      ) : (
        <form
          className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-6"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await sendPasswordReset(email);
              setSent(true);
            });
          }}
        >
          <TextField label="University email" type="email" required value={email} onChange={setEmail} autoComplete="email" />
          {error && <Notice tone="error">{error}</Notice>}
          <button type="submit" className={`${buttonClass} w-fit`} disabled={busy}>
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>
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
