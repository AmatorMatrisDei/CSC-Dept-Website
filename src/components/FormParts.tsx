import type { ReactNode } from "react";

// Small pieces the submission forms share, so they look and behave the same.

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="font-medium">
        {label}
      </label>
      {hint && (
        <p id={`${htmlFor}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {children}
    </div>
  );
}

export function Consent({
  id,
  title,
  text,
  checked,
  onChange,
  required,
}: {
  id: string;
  title: string;
  text: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  required?: boolean;
}) {
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        required={required}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-5 shrink-0 accent-[var(--accent)]"
      />
      <span>
        <span className="font-medium">
          {title}
          {required && <span className="text-muted"> (required)</span>}
        </span>
        <span className="block text-sm text-muted">{text}</span>
      </span>
    </label>
  );
}

// The invisible spam trap. Keep it out of the tab order and away from screen readers.
export function Honeypot({ name }: { name: string }) {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
      <label>
        Leave this empty
        <input type="text" name={name} tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  );
}

export function SubmitNotice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-lg border border-border bg-surface p-4">
      {children}
    </p>
  );
}
