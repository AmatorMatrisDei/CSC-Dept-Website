import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Notice, TextArea, buttonClass, secondaryButtonClass } from "@/components/Form";
import { STATUS_LABELS, describeSubmission, type ChangeTarget } from "@/lib/account";
import { useSignedInSession } from "@/lib/auth";
import { forgetCachedContent } from "@/lib/content";
import { formatDate } from "@/lib/format";
import { useAction, useAsync, useTitle } from "@/lib/hooks";
import { getReviewDetail, reviewChange, type ReviewDetail } from "@/lib/review";
import { mediaUrl } from "@/lib/supabase";
import NotFound from "@/pages/NotFound";

// One submission: what's on the site now beside what the student proposes (guide 2.4), then the
// decision. Approving applies the change at once; asking for changes or rejecting needs a note,
// which the student sees.

type Kind = "text" | "long" | "list" | "lines" | "bool" | "photo" | "link" | "name" | "names" | "members" | "images" | "status" | "date";

const FIELDS: Record<ChangeTarget, { key: string; label: string; kind: Kind }[]> = {
  profile: [
    { key: "name", label: "Name", kind: "text" },
    { key: "headline", label: "Headline", kind: "text" },
    { key: "major", label: "Major", kind: "text" },
    { key: "class_year", label: "Class year", kind: "text" },
    { key: "background", label: "Background", kind: "long" },
    { key: "skills", label: "Skills", kind: "list" },
    { key: "clubs_roles", label: "Clubs and roles", kind: "lines" },
    { key: "photo_path", label: "Photo", kind: "photo" },
    { key: "contact_email", label: "Contact email", kind: "text" },
    { key: "contact_phone", label: "Phone", kind: "text" },
    { key: "linkedin_url", label: "LinkedIn", kind: "link" },
    { key: "github_url", label: "GitHub", kind: "link" },
    { key: "website_url", label: "Website", kind: "link" },
  ],
  project: [
    { key: "title", label: "Title", kind: "text" },
    { key: "summary", label: "Summary", kind: "long" },
    { key: "description", label: "Description", kind: "long" },
    { key: "category_id", label: "Category", kind: "name" },
    { key: "sub_department_id", label: "Sub-department", kind: "name" },
    { key: "status", label: "Status", kind: "status" },
    { key: "date_started", label: "Date started", kind: "date" },
    { key: "date_finished", label: "Date finished", kind: "date" },
    { key: "tags", label: "Tags", kind: "list" },
    { key: "open_to_contributors", label: "Open to contributors", kind: "bool" },
    { key: "members", label: "Team", kind: "members" },
    { key: "advisor_ids", label: "Faculty advisors", kind: "names" },
    { key: "organization_ids", label: "Partners", kind: "names" },
    { key: "repo_url", label: "Source code", kind: "link" },
    { key: "demo_url", label: "Live demo", kind: "link" },
    { key: "poster_url", label: "Poster", kind: "link" },
    { key: "primary_contact_email", label: "Contact email", kind: "text" },
    { key: "primary_contact_phone", label: "Contact phone", kind: "text" },
    { key: "primary_contact_student_id", label: "Student contact", kind: "name" },
    { key: "thumbnail_path", label: "Thumbnail", kind: "photo" },
    { key: "thumbnail_alt", label: "Thumbnail alt text", kind: "text" },
    { key: "images", label: "Gallery", kind: "images" },
  ],
  internship: [
    { key: "company", label: "Company", kind: "text" },
    { key: "term", label: "Term", kind: "text" },
    { key: "description", label: "What they worked on", kind: "long" },
  ],
};

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

// Order matters for the team and gallery, not for advisor or partner ids.
function same(kind: Kind, a: unknown, b: unknown): boolean {
  if (isEmpty(a) && isEmpty(b)) return true;
  const norm = (v: unknown) => (kind === "names" && Array.isArray(v) ? [...v].sort() : v);
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

function Value({ kind, value, names, alt }: { kind: Kind; value: unknown; names: Record<string, string>; alt?: string }): ReactNode {
  if (isEmpty(value)) return <span className="text-muted">Empty</span>;
  switch (kind) {
    case "long":
      return <p className="whitespace-pre-wrap break-words">{String(value)}</p>;
    case "list":
      return <p className="break-words">{(value as string[]).join(", ")}</p>;
    case "lines":
      return (
        <ul className="list-disc pl-5">
          {(value as string[]).map((line) => (
            <li key={line} className="break-words">
              {line}
            </li>
          ))}
        </ul>
      );
    case "bool":
      return value ? "Yes" : "No";
    case "status":
      return String(value).charAt(0).toUpperCase() + String(value).slice(1);
    case "date":
      return formatDate(String(value));
    case "name":
      return names[String(value)] ?? "Unknown";
    case "names":
      return (value as string[]).map((id) => names[id] ?? "Unknown").join(", ");
    case "link":
      return (
        <a href={String(value)} target="_blank" rel="noopener noreferrer" className="break-all underline">
          {String(value)}
        </a>
      );
    case "photo": {
      const url = mediaUrl(String(value));
      return url ? <img src={url} alt={alt ?? "Proposed photo"} className="max-h-56 rounded border border-border" /> : null;
    }
    case "members":
      return (
        <ul className="flex flex-col gap-1">
          {(value as { student_id?: string; external_name?: string; role: string; term?: string; can_edit?: boolean }[]).map((m, i) => (
            <li key={i}>
              {m.student_id ? names[m.student_id] ?? "Unknown student" : `${m.external_name} (not a student)`}: {m.role}
              {m.term && `, ${m.term}`}
              {m.can_edit && " · can suggest changes"}
            </li>
          ))}
        </ul>
      );
    case "images":
      return (
        <ul className="grid gap-3 sm:grid-cols-2">
          {(value as { storage_path: string; alt_text: string; caption?: string }[]).map((image) => (
            <li key={image.storage_path} className="flex flex-col gap-1 text-sm">
              <img src={mediaUrl(image.storage_path) ?? ""} alt={image.alt_text} className="rounded border border-border" />
              <span>
                <strong>Alt text:</strong> {image.alt_text}
              </span>
              {image.caption && (
                <span>
                  <strong>Caption:</strong> {image.caption}
                </span>
              )}
            </li>
          ))}
        </ul>
      );
    default:
      return <span className="break-words">{String(value)}</span>;
  }
}

export default function ReviewChange() {
  const { id = "" } = useParams();
  const detail = useAsync(getReviewDetail, id);
  useTitle("Review a submission");
  if (detail === undefined) return <p className="text-muted">Loading…</p>;
  if (detail === null) return <NotFound what="submission" />;
  return <Review detail={detail} />;
}

function Review({ detail }: { detail: ReviewDetail }) {
  const session = useSignedInSession();
  const navigate = useNavigate();
  const [note, setNote] = useState("");
  const { busy, error, run } = useAction();

  const titles: Record<string, string> = {};
  if (detail.target_id && detail.current) {
    const current = detail.current as { title?: string; company?: string };
    titles[detail.target_id] = current.title ?? current.company ?? "";
  }
  const proposed = detail.proposed_data;
  const current = detail.current;
  const fields = FIELDS[detail.target_type];
  const shown = detail.action === "delete"
    ? fields.filter((f) => current && !isEmpty(current[f.key]))
    : fields.filter((f) => f.key in proposed);
  const altFor = (key: string, source: Record<string, unknown> | null) =>
    key === "thumbnail_path" ? String(source?.thumbnail_alt ?? "Thumbnail") : undefined;
  const own = detail.submitter_id === session.user.id;

  function decide(decision: "approved" | "rejected" | "changes_requested") {
    void run(async () => {
      if (decision !== "approved" && !note.trim()) {
        throw new Error("Add a note saying what needs to change or why, so the student knows what to do.");
      }
      await reviewChange(detail.id, decision, note);
      forgetCachedContent();
      navigate("/review", { state: { message: `${STATUS_LABELS[decision]}: ${describeSubmission(detail, titles)}.` } });
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link to="/review" className="inline-flex min-h-11 w-fit items-center text-sm underline">
          All submissions
        </Link>
        <h1 className="text-3xl font-semibold">{describeSubmission(detail, titles)}</h1>
        <p className="text-muted">
          From{" "}
          {detail.submitter ? (
            <strong>{detail.submitter.name}</strong>
          ) : (
            "a removed account"
          )}{" "}
          · sent {formatDate(detail.created_at)} · {STATUS_LABELS[detail.status]}
        </p>
      </header>

      {detail.target_type === "profile" && (
        <Notice>
          {detail.action === "create" && "Approving lists this student in the public directory. "}
          {detail.action === "delete" &&
            "Their profile is already hidden. Approving clears their profile details, project listings and internships, and withdraws their permissions. "}
          They currently allow:{" "}
          {detail.consents.length ? detail.consents.join(", ") : "nothing"}. A photo, email or phone can only be shown
          with the matching permission.
        </Notice>
      )}
      {detail.action === "delete" && detail.target_type !== "profile" && (
        <Notice>Approving removes this from the site.</Notice>
      )}

      <section aria-label="Proposed changes" className="flex flex-col gap-3">
        {shown.length === 0 && <p className="text-muted">Nothing to compare.</p>}
        {shown.map((field) => {
          const before = current?.[field.key];
          const after = proposed[field.key];
          const changed = detail.action === "update" && !same(field.kind, before, after);
          const unchanged = detail.action === "update" && !changed;
          return (
            <div
              key={field.key}
              className={`flex flex-col gap-2 rounded-lg border bg-surface p-4 ${changed ? "border-highlight" : "border-border"}`}
            >
              <h2 className="flex flex-wrap items-center gap-2 font-semibold">
                {field.label}
                {changed && <span className="rounded border border-highlight px-2 py-0.5 text-xs font-medium">Changed</span>}
                {unchanged && <span className="text-xs font-normal text-muted">No change</span>}
              </h2>
              {detail.action === "update" && changed ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted">On the site now</p>
                    <Value kind={field.kind} value={before} names={detail.names} alt={altFor(field.key, current)} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted">Proposed</p>
                    <Value kind={field.kind} value={after} names={detail.names} alt={altFor(field.key, proposed)} />
                  </div>
                </div>
              ) : (
                <Value
                  kind={field.kind}
                  value={detail.action === "delete" ? before : after}
                  names={detail.names}
                  alt={altFor(field.key, detail.action === "delete" ? current : proposed)}
                />
              )}
            </div>
          );
        })}
      </section>

      {detail.status !== "pending" ? (
        <Notice>
          {STATUS_LABELS[detail.status]}
          {detail.reviewer && ` by ${detail.reviewer.name}`}
          {detail.reviewed_at && ` on ${formatDate(detail.reviewed_at)}`}.
          {detail.reason && ` Note: ${detail.reason}`}
        </Notice>
      ) : (
        <section aria-labelledby="decision" className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-6">
          <h2 id="decision" className="text-xl font-semibold">
            Decision
          </h2>
          {own && <p className="text-sm text-muted">This is your own submission. Your decision is marked as a self-review in the audit log.</p>}
          <TextArea
            label="Note to the student"
            value={note}
            onChange={setNote}
            maxLength={2000}
            rows={3}
            hint="Required when asking for changes or not approving. Say what to fix, e.g. “Add alt text that describes the photo.”"
          />
          {error && <Notice tone="error">{error}</Notice>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonClass} disabled={busy} onClick={() => decide("approved")}>
              {detail.action === "delete" ? "Approve removal" : "Approve and publish"}
            </button>
            <button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => decide("changes_requested")}>
              Ask for changes
            </button>
            <button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => decide("rejected")}>
              Don&apos;t approve
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
