import { type FormEvent, useState } from "react";
import { Link, useParams } from "react-router";
import { Field, Honeypot, SubmitNotice } from "@/components/FormParts";
import { getProjectId, getReferenceIds, submitChange } from "@/lib/account";
import { useAuth } from "@/lib/auth";
import { getAllFaculty, getProject, getSubDepartments } from "@/lib/content";
import { HONEYPOT, inputClass } from "@/lib/form";
import { useAsync, useTitle } from "@/lib/hooks";
import type { ProjectView } from "@/lib/types";
import { CATEGORY_LABELS, STATUSES } from "@/lib/types";

// Project request. Needs a signed-in student. With a slug in the address (/projects/:slug/edit) it
// asks to change that project; otherwise it asks to add a new one. Either way it adds a row to the
// review queue and nothing goes live until a reviewer approves it. The fields follow what the
// database accepts: supabase/migrations/*_review_queue.sql, project_fields().
// Pictures are not sent yet: the storage rules have no folder a new submission may upload to.

type Member = { id: number; name: string; role: string };

const buttonClass =
  "min-h-11 rounded border border-border bg-surface px-4 py-2 font-medium hover:border-highlight";

const slugify = (title: string) =>
  title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

const loadExisting = (slug: string) => (slug ? getProject(slug) : Promise.resolve(undefined));

// Keyed by slug so moving between projects starts a fresh form.
export default function ProjectSubmit() {
  const { slug = "" } = useParams();
  return <ProjectForm key={slug} slug={slug} />;
}

function ProjectForm({ slug }: { slug: string }) {
  const changing = slug !== "";
  useTitle(changing ? "Request project changes" : "Submit a project");
  const { ready, userId } = useAuth();
  const departments = useAsync(getSubDepartments);
  const faculty = useAsync(getAllFaculty);
  const existing = useAsync(loadExisting, slug);
  const [members, setMembers] = useState<Member[]>([{ id: 0, name: "", role: "" }]);
  const [nextId, setNextId] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    if (data.get(HONEYPOT)) {
      setSent(true);
      return;
    }
    setBusy(true);
    setError(null);
    const text = (name: string) => String(data.get(name) ?? "").trim();

    const proposed: Record<string, unknown> = {
      title: text("title"),
      summary: text("summary"),
      description: text("description"),
      status: text("status"),
      date_started: text("date_started") || null,
      date_finished: text("date_finished") || null,
      open_to_contributors: data.get("open_to_contributors") === "on",
      primary_contact_email: text("primary_contact_email") || null,
    };

    let message: string | null;
    if (changing) {
      const id = await getProjectId(slug);
      message = id ? await submitChange("project", "update", proposed, id) : "Could not find that project.";
    } else {
      const ids = await getReferenceIds();
      const categoryId = ids.categories.get(text("category"));
      const departmentId = ids.departments.get(text("sub_department"));
      if (!categoryId || !departmentId) {
        setBusy(false);
        setError("Could not match the category or sub-department. Please try again.");
        return;
      }
      const advisorId = ids.faculty.get(text("advisor"));
      const team = members.filter((m) => m.name.trim()).map((m) => ({ external_name: m.name.trim(), role: m.role.trim() || "Contributor" }));
      Object.assign(proposed, {
        slug: `${slugify(text("title")) || "project"}-${crypto.randomUUID().slice(0, 6)}`,
        category_id: categoryId,
        sub_department_id: departmentId,
        repo_url: text("repo_url") || null,
        demo_url: text("demo_url") || null,
        poster_url: text("poster_url") || null,
        advisor_ids: advisorId ? [advisorId] : [],
        members: team,
      });
      message = await submitChange("project", "create", proposed);
    }
    setBusy(false);
    if (message) setError(message);
    else setSent(true);
  }

  function update(id: number, patch: Partial<Member>) {
    setMembers((all) => all.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  if (!ready || (changing && existing === undefined)) return <p className="text-muted">Loading…</p>;

  const heading = changing ? "Request project changes" : "Submit a project";

  if (!userId) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <h1 className="text-3xl font-semibold">{heading}</h1>
        <p>
          Sign in with your Franciscan account first, so a reviewer knows who sent it.{" "}
          <Link to="/account" className="underline">
            Sign in or create an account
          </Link>
        </p>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <h1 className="text-3xl font-semibold">Request sent</h1>
        <SubmitNotice>
          Thank you. A reviewer will look at it soon. You can follow it on{" "}
          <Link to="/account" className="underline">
            your account page
          </Link>
          .
        </SubmitNotice>
      </div>
    );
  }

  if (changing && !existing) {
    return <p>Could not find that project. <Link to="/projects" className="underline">Back to projects</Link></p>;
  }

  const was: ProjectView | undefined = existing ?? undefined;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">{heading}</h1>
        <p className="text-muted">
          {changing
            ? "Change what you need to. A faculty or staff reviewer checks it before it goes live."
            : "Tell us about a project to show on the site. A faculty or staff reviewer checks every submission first, and may ask you to change something before it goes live."}
        </p>
      </div>

      <form onSubmit={submit} className="relative flex flex-col gap-8">
        <Honeypot name={HONEYPOT} />

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-xl font-semibold">The project</legend>
          <Field label="Title" htmlFor="title">
            <input id="title" name="title" required maxLength={200} defaultValue={was?.title ?? ""} className={inputClass} />
          </Field>
          <Field label="Short summary" htmlFor="summary" hint="One or two sentences, shown on project cards (up to 500 characters).">
            <textarea id="summary" name="summary" required rows={3} maxLength={500} defaultValue={was?.summary ?? ""} aria-describedby="summary-hint" className={inputClass} />
          </Field>
          <Field label="Full description" htmlFor="description" hint="What it is, how it works, what you learned. Plain text.">
            <textarea id="description" name="description" required rows={8} maxLength={20000} defaultValue={was?.description ?? ""} aria-describedby="description-hint" className={inputClass} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            {!changing && (
              <>
                <Field label="Category" htmlFor="category">
                  <select id="category" name="category" required defaultValue="" className={inputClass}>
                    <option value="" disabled>
                      Choose one
                    </option>
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Sub-department" htmlFor="sub_department">
                  <select id="sub_department" name="sub_department" required defaultValue="" className={inputClass}>
                    <option value="" disabled>
                      {departments ? "Choose one" : "Loading…"}
                    </option>
                    {departments?.map((d) => (
                      <option key={d.slug} value={d.slug}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            <Field label="Status" htmlFor="status">
              <select id="status" name="status" required defaultValue={was?.status.toLowerCase() ?? ""} className={inputClass}>
                <option value="" disabled>
                  Choose one
                </option>
                {STATUSES.map((s) => (
                  <option key={s} value={s.toLowerCase()}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            {!changing && (
              <Field label="Faculty advisor" htmlFor="advisor">
                <select id="advisor" name="advisor" defaultValue="" className={inputClass}>
                  <option value="">{faculty ? "None or not sure" : "Loading…"}</option>
                  {faculty?.map((f) => (
                    <option key={f.slug} value={f.slug}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Started" htmlFor="date_started">
              <input id="date_started" name="date_started" type="date" defaultValue={was?.date_started ?? ""} className={inputClass} />
            </Field>
            <Field label="Finished" htmlFor="date_finished" hint="Leave empty if it is still going.">
              <input id="date_finished" name="date_finished" type="date" defaultValue={was?.date_finished ?? ""} aria-describedby="date_finished-hint" className={inputClass} />
            </Field>
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <input type="checkbox" name="open_to_contributors" defaultChecked={was?.open_to_contributors} className="size-5 accent-[var(--accent)]" />
            <span>Open to new contributors</span>
          </label>
        </fieldset>

        {!changing && (
          <>
            <fieldset className="flex flex-col gap-4">
              <legend className="mb-1 text-xl font-semibold">Links</legend>
              <p className="text-sm text-muted">All optional. Each must start with https://</p>
              <Field label="Source code" htmlFor="repo_url">
                <input id="repo_url" name="repo_url" type="url" pattern="https://.*" placeholder="https://" className={inputClass} />
              </Field>
              <Field label="Live demo" htmlFor="demo_url">
                <input id="demo_url" name="demo_url" type="url" pattern="https://.*" placeholder="https://" className={inputClass} />
              </Field>
              <Field label="Poster" htmlFor="poster_url">
                <input id="poster_url" name="poster_url" type="url" pattern="https://.*" placeholder="https://" className={inputClass} />
              </Field>
            </fieldset>

            <fieldset className="flex flex-col gap-4">
              <legend className="mb-1 text-xl font-semibold">The team</legend>
              <p className="text-sm text-muted">
                Add the people who worked on it. Students are shown by name only if they agree to be
                listed on the site.
              </p>
              <ul className="flex flex-col gap-3">
                {members.map((m, i) => (
                  <li key={m.id} className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <Field label={`Member ${i + 1} name`} htmlFor={`member-name-${m.id}`}>
                      <input
                        id={`member-name-${m.id}`}
                        value={m.name}
                        onChange={(e) => update(m.id, { name: e.target.value })}
                        maxLength={120}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Role" htmlFor={`member-role-${m.id}`}>
                      <input
                        id={`member-role-${m.id}`}
                        value={m.role}
                        onChange={(e) => update(m.id, { role: e.target.value })}
                        placeholder="Project lead"
                        maxLength={100}
                        className={inputClass}
                      />
                    </Field>
                    {members.length > 1 && (
                      <button type="button" onClick={() => setMembers((all) => all.filter((x) => x.id !== m.id))} className={buttonClass}>
                        Remove<span className="sr-only"> member {i + 1}</span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => {
                  setMembers((all) => [...all, { id: nextId, name: "", role: "" }]);
                  setNextId(nextId + 1);
                }}
                className={`${buttonClass} self-start`}
              >
                Add another member
              </button>
            </fieldset>
          </>
        )}

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-xl font-semibold">Contact</legend>
          <Field label="Project contact email" htmlFor="primary_contact_email" hint="Optional. If given, it is shown on the project page.">
            <input id="primary_contact_email" name="primary_contact_email" type="email" defaultValue={was?.contact_email ?? ""} aria-describedby="primary_contact_email-hint" className={inputClass} />
          </Field>
        </fieldset>

        <div className="flex flex-col gap-3">
          <button type="submit" disabled={busy} className="min-h-11 self-start rounded bg-accent px-5 py-2 font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60">
            {busy ? "Sending…" : changing ? "Send changes" : "Submit project"}
          </button>
          {error && (
            <p role="alert" className="rounded-lg border border-border bg-surface p-3">
              {error}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
