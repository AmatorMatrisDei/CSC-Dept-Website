import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { mediaUrl } from "@/lib/supabase";

// Building blocks for the account and review forms. Every control has a visible label, hints are
// tied to their field with aria-describedby, and targets are at least 44px tall.

export const fieldClass = "min-h-11 w-full rounded border border-border bg-background px-3";
export const buttonClass =
  "inline-flex min-h-11 items-center justify-center rounded bg-accent px-4 font-medium text-accent-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded border border-border px-4 hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50";

type Common = { label: string; hint?: ReactNode; required?: boolean };

function Label({ label, required }: Common) {
  return (
    <span className="font-medium">
      {label}
      {required && <span className="text-muted"> (required)</span>}
    </span>
  );
}

function Hint({ id, children }: { id: string; children?: ReactNode }) {
  return children ? (
    <span id={id} className="text-sm text-muted">
      {children}
    </span>
  ) : null;
}

export function TextField({
  label,
  hint,
  required,
  value,
  onChange,
  type = "text",
  maxLength,
  autoComplete,
  placeholder,
  disabled,
  min,
  max,
  pattern,
  inputMode,
}: Common & {
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "email" | "url" | "tel" | "password" | "number" | "date" | "time";
  maxLength?: number;
  autoComplete?: string;
  placeholder?: string;
  disabled?: boolean;
  min?: number | string;
  max?: number | string;
  pattern?: string;
  inputMode?: "numeric" | "email" | "url" | "tel";
}) {
  const id = useId();
  return (
    <label className="flex flex-col gap-1">
      <Label label={label} required={required} />
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        maxLength={maxLength}
        autoComplete={autoComplete}
        placeholder={placeholder}
        disabled={disabled}
        min={min}
        max={max}
        pattern={pattern}
        inputMode={inputMode}
        aria-describedby={hint ? id : undefined}
        className={`${fieldClass} disabled:opacity-60`}
      />
      <Hint id={id}>{hint}</Hint>
    </label>
  );
}

export function TextArea({
  label,
  hint,
  required,
  value,
  onChange,
  maxLength,
  rows = 4,
  disabled,
}: Common & { value: string; onChange: (value: string) => void; maxLength?: number; rows?: number; disabled?: boolean }) {
  const id = useId();
  return (
    <label className="flex flex-col gap-1">
      <Label label={label} required={required} />
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        maxLength={maxLength}
        rows={rows}
        disabled={disabled}
        aria-describedby={id}
        className={`${fieldClass} py-2 disabled:opacity-60`}
      />
      <span id={id} className="flex flex-wrap justify-between gap-x-4 text-sm text-muted">
        <span>{hint}</span>
        {maxLength && (
          <span>
            {value.length.toLocaleString()} / {maxLength.toLocaleString()}
          </span>
        )}
      </span>
    </label>
  );
}

export function SelectField({
  label,
  hint,
  required,
  value,
  onChange,
  options,
  placeholder = "Choose…",
}: Common & {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  const id = useId();
  return (
    <label className="flex flex-col gap-1">
      <Label label={label} required={required} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        aria-describedby={hint ? id : undefined}
        className={fieldClass}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Hint id={id}>{hint}</Hint>
    </label>
  );
}

export function CheckField({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: { label: ReactNode; hint?: ReactNode; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <label className="flex min-h-11 items-start gap-3 py-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        aria-describedby={hint ? id : undefined}
        className="mt-1 size-5 shrink-0 accent-[var(--accent)]"
      />
      <span className="flex flex-col">
        <span>{label}</span>
        <Hint id={id}>{hint}</Hint>
      </span>
    </label>
  );
}

// A titled group of fields.
export function Fieldset({ legend, description, children }: { legend: string; description?: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-6">
      <legend className="px-1 text-lg font-semibold">{legend}</legend>
      {description && <div className="-mt-2 text-sm text-muted">{description}</div>}
      {children}
    </fieldset>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "success"; children: ReactNode }) {
  const styles = {
    info: "border-border bg-surface",
    error: "border-danger bg-surface",
    success: "border-accent bg-surface",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border-l-4 border ${styles[tone]} p-4`}>
      {children}
    </div>
  );
}

// Photos ----------------------------------------------------------------------------------------

// A photo is either already uploaded (`path`) or picked on this device and not yet uploaded (`file`).
export type PhotoValue = { path: string | null; file: File | null };

export const ACCEPT_PHOTOS = "image/jpeg,image/png,image/webp";
const MAX_PICK_BYTES = 25 * 1024 * 1024; // before shrinking; uploads end up far smaller

function checkPickedFile(file: File): string | null {
  if (!file.type.startsWith("image/")) return "Choose a photo: JPEG, PNG or WebP.";
  if (file.size > MAX_PICK_BYTES) return "That file is very large. Choose a photo under 25 MB.";
  return null;
}

// Shows a picked file without uploading it. The object URL goes straight onto the element and
// is released when the file changes or the preview goes away.
function LocalImage({ file, alt, className }: { file: File; alt: string; className: string }) {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    if (ref.current) ref.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <img ref={ref} alt={alt} className={className} />;
}

export function PhotoPreview({ value, alt, className }: { value: PhotoValue; alt: string; className: string }) {
  if (value.file) return <LocalImage file={value.file} alt={alt} className={className} />;
  const url = mediaUrl(value.path);
  return url ? <img src={url} alt={alt} className={className} /> : null;
}

export function PhotoField({
  label,
  hint,
  value,
  onChange,
  previewAlt,
  round,
}: {
  label: string;
  hint?: ReactNode;
  value: PhotoValue;
  onChange: (value: PhotoValue) => void;
  previewAlt: string;
  round?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const has = Boolean(value.file || value.path);
  return (
    <div className="flex flex-col gap-2">
      <span className="font-medium">{label}</span>
      {has && (
        <PhotoPreview
          value={value}
          alt={previewAlt}
          className={round ? "size-28 rounded-full object-cover" : "aspect-[3/2] w-full max-w-sm rounded border border-border object-cover"}
        />
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondaryButtonClass} onClick={() => input.current?.click()} aria-describedby={id}>
          {has ? "Choose a different photo" : "Choose a photo"}
        </button>
        {has && (
          <button type="button" className={secondaryButtonClass} onClick={() => onChange({ path: null, file: null })}>
            Remove photo
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept={ACCEPT_PHOTOS}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const issue = checkPickedFile(file);
          setProblem(issue);
          if (!issue) onChange({ path: null, file });
        }}
      />
      <Hint id={id}>{hint}</Hint>
      {problem && (
        <p role="alert" className="text-sm font-medium">
          {problem}
        </p>
      )}
    </div>
  );
}

// A project gallery: several photos, each with required alt text and an optional caption, in
// display order.
export type GalleryItem = PhotoValue & { key: string; alt_text: string; caption: string };

const MAX_GALLERY = 12;

export function GalleryField({ items, onChange }: { items: GalleryItem[]; onChange: (items: GalleryItem[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const update = (key: string, change: Partial<GalleryItem>) =>
    onChange(items.map((item) => (item.key === key ? { ...item, ...change } : item)));
  const move = (index: number, by: number) => {
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-4">
      {items.length > 0 && (
        <ol className="flex flex-col gap-4">
          {items.map((item, i) => (
            <li key={item.key} className="grid gap-3 rounded border border-border p-3 sm:grid-cols-[10rem_1fr]">
              <PhotoPreview value={item} alt={item.alt_text} className="aspect-[3/2] w-full rounded object-cover" />
              <div className="flex flex-col gap-3">
                <TextField
                  label={`Photo ${i + 1}: alt text`}
                  required
                  value={item.alt_text}
                  onChange={(alt_text) => update(item.key, { alt_text })}
                  maxLength={300}
                  hint="One sentence describing the photo for people who can't see it."
                />
                <TextField
                  label="Caption"
                  value={item.caption}
                  onChange={(caption) => update(item.key, { caption })}
                  maxLength={500}
                  hint="Optional, shown under the photo."
                />
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={secondaryButtonClass} disabled={i === 0} onClick={() => move(i, -1)}>
                    Move up
                  </button>
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    disabled={i === items.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    Move down
                  </button>
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    onClick={() => onChange(items.filter((other) => other.key !== item.key))}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div>
        <button
          type="button"
          className={secondaryButtonClass}
          disabled={items.length >= MAX_GALLERY}
          onClick={() => input.current?.click()}
        >
          Add photos
        </button>
        <p className="mt-1 text-sm text-muted">
          Up to {MAX_GALLERY} photos: JPEG, PNG or WebP. They are resized before upload, and location data is removed.
        </p>
      </div>
      <input
        ref={input}
        type="file"
        accept={ACCEPT_PHOTOS}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          const issues = files.map(checkPickedFile).filter(Boolean);
          setProblem(issues[0] ?? null);
          const added = files
            .filter((file) => !checkPickedFile(file))
            .slice(0, MAX_GALLERY - items.length)
            .map((file) => ({ key: crypto.randomUUID(), path: null, file, alt_text: "", caption: "" }));
          onChange([...items, ...added]);
        }}
      />
      {problem && (
        <p role="alert" className="text-sm font-medium">
          {problem}
        </p>
      )}
    </div>
  );
}
