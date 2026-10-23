import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import {
  CheckField,
  Fieldset,
  GalleryField,
  Notice,
  PhotoField,
  SelectField,
  TextArea,
  TextField,
  buttonClass,
  secondaryButtonClass,
  type GalleryItem,
  type PhotoValue,
} from "@/components/Form";
import {
  getFormOptions,
  getMyRole,
  getProjectForEdit,
  getSubmission,
  removeUploads,
  resubmitChange,
  submitChange,
  uploadPhoto,
  type FormOptions,
  type MemberInput,
  type ProjectFields,
  type Submission,
} from "@/lib/account";
import { useSignedInSession } from "@/lib/auth";
import { useAction, useAsync, useTitle } from "@/lib/hooks";
import NotFound from "@/pages/NotFound";

// Submit a new project, suggest changes to one you help run, or send back a submission a reviewer
// returned (FR-1.1 to FR-1.4, FR-3.3). Everything goes to the review queue; nothing is live until
// a reviewer approves it.

const OTHER = "__other__";
const STATUS_OPTIONS = [
  { value: "planned", label: "Planned" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
];

type MemberRow = { key: string; who: string; external_name: string; role: string; term: string; can_edit: boolean };

type Loaded = {
  options: FormOptions;
  me: { id: string; name: string };
  project: (ProjectFields & { id: string; slug: string }) | null;
  change: Submission | null;
};

async function loadForm(userId: string, projectId: string, changeId: string): Promise<Loaded> {
  const [options, role, project, change] = await Promise.all([
    getFormOptions(),
    getMyRole(userId),
    projectId ? getProjectForEdit(projectId) : null,
    changeId ? getSubmission(changeId) : null,
  ]);
  return { options, me: { id: userId, name: role?.name ?? "You" }, project, change };
}

function emptyProject(userId: string): ProjectFields {
  return {
    title: "", summary: "", description: "", status: "active", category_id: "", sub_department_id: "",
    date_started: null, date_finished: null, thumbnail_path: null, thumbnail_alt: null, tags: [],
    repo_url: null, demo_url: null, poster_url: null, primary_contact_email: null, primary_contact_phone: null,
    primary_contact_student_id: null, open_to_contributors: false,
    members: [{ student_id: userId, role: "", term: "", can_edit: true }],
    advisor_ids: [], organization_ids: [], images: [],
  };
}

export default function ProjectForm() {
  const session = useSignedInSession();
  const { id: projectId = "" } = useParams();
  const [params] = useSearchParams();
  const changeId = params.get("change") ?? "";
  const loaded = useAsync(loadForm, session.user.id, projectId, changeId);
  useTitle(projectId ? "Suggest project changes" : "Submit a project");

  if (!loaded) return <p className="text-muted">Loading…</p>;
  if (projectId && !loaded.project) return <NotFound what="project" />;

  const change = loaded.change?.target_type === "project" && loaded.change.status === "changes_requested" ? loaded.change : null;
  return <Editor key={`${projectId}:${changeId}`} {...loaded} change={change} projectId={projectId} />;
}

function Editor({ options, me, project, change, projectId }: Loaded & { projectId: string }) {
  const start: ProjectFields = {
    ...(project ?? emptyProject(me.id)),
    ...(change?.proposed_data as Partial<ProjectFields> | undefined),
  };
  const navigate = useNavigate();
  const { busy, error, run } = useAction();

  const [title, setTitle] = useState(start.title);
  const [summary, setSummary] = useState(start.summary);
  const [description, setDescription] = useState(start.description);
  const [categoryId, setCategoryId] = useState(start.category_id);
  const [subDepartmentId, setSubDepartmentId] = useState(start.sub_department_id);
  const [status, setStatus] = useState<string>(start.status);
  const [dateStarted, setDateStarted] = useState(start.date_started ?? "");
  const [dateFinished, setDateFinished] = useState(start.date_finished ?? "");
  const [tags, setTags] = useState(start.tags.join(", "));
  const [repoUrl, setRepoUrl] = useState(start.repo_url ?? "");
  const [demoUrl, setDemoUrl] = useState(start.demo_url ?? "");
  const [posterUrl, setPosterUrl] = useState(start.poster_url ?? "");
  const [contactEmail, setContactEmail] = useState(start.primary_contact_email ?? "");
  const [contactPhone, setContactPhone] = useState(start.primary_contact_phone ?? "");
  const [contactStudent, setContactStudent] = useState(start.primary_contact_student_id ?? "");
  const [openToContributors, setOpenToContributors] = useState(start.open_to_contributors);
  const [advisorIds, setAdvisorIds] = useState(start.advisor_ids);
  const [organizationIds, setOrganizationIds] = useState(start.organization_ids);
  const [thumbnail, setThumbnail] = useState<PhotoValue>({ path: start.thumbnail_path, file: null });
  const [thumbnailAlt, setThumbnailAlt] = useState(start.thumbnail_alt ?? "");
  const [gallery, setGallery] = useState<GalleryItem[]>(() =>
    start.images.map((i) => ({ key: crypto.randomUUID(), path: i.storage_path, file: null, alt_text: i.alt_text, caption: i.caption })));
  const [members, setMembers] = useState<MemberRow[]>(() =>
    start.members.map((m) => ({
      key: crypto.randomUUID(),
      who: m.student_id ?? OTHER,
      external_name: m.external_name ?? "",
      role: m.role,
      term: m.term,
      can_edit: m.can_edit,
    })));

  // Students who can be added: everyone in the directory, you, and anyone already on the team.
  const studentNames = new Map(options.students.map((s) => [s.id, s.name]));
  studentNames.set(me.id, `${me.name} (you)`);
  for (const m of start.members) {
    if (m.student_id && !studentNames.has(m.student_id)) studentNames.set(m.student_id, "A student not in the directory");
  }
  const whoOptions = [
    ...[...studentNames].map(([value, label]) => ({ value, label })),
    { value: OTHER, label: "Someone who isn't a student (mentor, partner…)" },
  ];
  const teamStudents = members.filter((m) => m.who !== OTHER && m.who);

  const setMember = (key: string, change: Partial<MemberRow>) =>
    setMembers((rows) => rows.map((row) => (row.key === key ? { ...row, ...change } : row)));
  const moveMember = (index: number, by: number) =>
    setMembers((rows) => {
      const next = [...rows];
      const [row] = next.splice(index, 1);
      next.splice(index + by, 0, row);
      return next;
    });
  const toggle = (list: string[], id: string, on: boolean) => (on ? [...list, id] : list.filter((x) => x !== id));

  async function save() {
    const tagList = [...new Set(tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))];
    if (tagList.length > 20) throw new Error("Use up to 20 tags.");
    if (dateStarted && dateFinished && dateFinished < dateStarted) throw new Error("The finish date can't be before the start date.");
    if (thumbnail.path || thumbnail.file) {
      if (!thumbnailAlt.trim()) throw new Error("Describe the thumbnail photo (alt text).");
    }
    if (gallery.some((g) => !g.alt_text.trim())) throw new Error("Every gallery photo needs alt text.");
    if (members.length === 0) throw new Error("List at least one team member.");
    const seen = new Set<string>();
    for (const m of members) {
      if (!m.who) throw new Error("Choose who each team member is.");
      const id = `${m.who === OTHER ? m.external_name.trim().toLowerCase() : m.who}|${m.role.trim().toLowerCase()}`;
      if (seen.has(id)) throw new Error("The same person is listed twice with the same role.");
      seen.add(id);
    }

    const uploaded: string[] = [];
    try {
      let thumbnailPath = thumbnail.path;
      if (thumbnail.file) {
        thumbnailPath = await uploadPhoto(me.id, "submissions", thumbnail.file);
        uploaded.push(thumbnailPath);
      }
      const images = [];
      for (const item of gallery) {
        let path = item.path;
        if (item.file) {
          path = await uploadPhoto(me.id, "submissions", item.file);
          uploaded.push(path);
        }
        images.push({ storage_path: path!, alt_text: item.alt_text.trim(), caption: item.caption.trim() });
      }

      const proposed: ProjectFields = {
        title: title.trim(),
        summary: summary.trim(),
        description: description.trim(),
        status: status as ProjectFields["status"],
        category_id: categoryId,
        sub_department_id: subDepartmentId,
        date_started: dateStarted || null,
        date_finished: dateFinished || null,
        thumbnail_path: thumbnailPath,
        thumbnail_alt: thumbnailPath ? thumbnailAlt.trim() : null,
        tags: tagList,
        repo_url: repoUrl.trim() || null,
        demo_url: demoUrl.trim() || null,
        poster_url: posterUrl.trim() || null,
        primary_contact_email: contactEmail.trim() || null,
        primary_contact_phone: contactPhone.trim() || null,
        primary_contact_student_id: teamStudents.some((m) => m.who === contactStudent) ? contactStudent : null,
        open_to_contributors: openToContributors,
        members: members.map((m): MemberInput => ({
          ...(m.who === OTHER ? { external_name: m.external_name.trim() } : { student_id: m.who }),
          role: m.role.trim(),
          term: m.term.trim(),
          can_edit: m.who !== OTHER && m.can_edit,
        })),
        advisor_ids: advisorIds,
        organization_ids: organizationIds,
        images,
      };

      if (change) await resubmitChange(change.id, proposed);
      else if (projectId) await submitChange({ target_type: "project", action: "update", target_id: projectId, proposed_data: proposed });
      else await submitChange({ target_type: "project", action: "create", proposed_data: proposed });
    } catch (e) {
      await removeUploads(uploaded).catch(() => undefined);
      throw e;
    }
    navigate("/account", {
      state: { message: projectId ? "Your changes were sent for review." : "Your project was sent for review." },
    });
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link to="/account" className="inline-flex min-h-11 w-fit items-center text-sm underline">
          My account
        </Link>
        <h1 className="text-3xl font-semibold">{project ? `Suggest changes to ${project.title}` : "Submit a project"}</h1>
        <p className="text-muted">
          A reviewer checks every submission before it appears on the site. Have your faculty advisor look it over
          first if you can.
        </p>
      </header>

      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          void run(save);
        }}
      >
        {change?.reason && (
          <Notice>
            <strong>The reviewer asked:</strong> {change.reason}
          </Notice>
        )}

        <Fieldset legend="The project">
          <TextField label="Title" required value={title} onChange={setTitle} maxLength={200}
            hint="Short and specific, e.g. Campus Delivery Robot." />
          <TextArea label="Summary" required value={summary} onChange={setSummary} maxLength={500} rows={2}
            hint="One or two sentences for project cards and the home page: what it is and why it matters." />
          <TextArea label="Description" required value={description} onChange={setDescription} maxLength={20000} rows={10}
            hint="The full story: the problem, what you built, how it works, results and what's next. Leave a blank line between paragraphs." />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Category" required value={categoryId} onChange={setCategoryId}
              options={options.categories.map((c) => ({ value: c.id, label: c.name }))}
              hint="Collaborating Organizations: also tick the partners below." />
            <SelectField label="Sub-department" required value={subDepartmentId} onChange={setSubDepartmentId}
              options={options.subDepartments.map((d) => ({ value: d.id, label: d.name }))}
              hint="The one that fits best." />
            <SelectField label="Status" required value={status} onChange={setStatus} options={STATUS_OPTIONS} />
            <TextField label="Tags" value={tags} onChange={setTags} hint="Up to 20, separated by commas, e.g. robotics, embedded." />
            <TextField label="Date started" type="date" value={dateStarted} onChange={setDateStarted}
              hint="The year filter uses this date." />
            <TextField label="Date finished" type="date" value={dateFinished} onChange={setDateFinished}
              min={dateStarted || undefined} hint="Leave empty if it isn't finished." />
          </div>
          <CheckField label="Open to new contributors" checked={openToContributors} onChange={setOpenToContributors}
            hint="Tells newer students they can ask to join." />
        </Fieldset>

        <Fieldset
          legend="Team"
          description="Teammates must be in the student directory to be added, and are asked to confirm before their name appears. Use “Someone who isn't a student” only for mentors, partners and other non-students."
        >
          <ol className="flex flex-col gap-4">
            {members.map((m, i) => (
              <li key={m.key} className="flex flex-col gap-3 rounded border border-border p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField label={`Member ${i + 1}`} required value={m.who} onChange={(who) => setMember(m.key, { who })}
                    options={whoOptions} />
                  {m.who === OTHER && (
                    <TextField label="Their name" required value={m.external_name} maxLength={120}
                      onChange={(external_name) => setMember(m.key, { external_name })} />
                  )}
                  <TextField label="Role" required value={m.role} maxLength={100} onChange={(role) => setMember(m.key, { role })}
                    hint="e.g. Hardware lead" />
                  <TextField label="Term" value={m.term} maxLength={50} onChange={(term) => setMember(m.key, { term })}
                    hint="e.g. Fall 2026" />
                </div>
                {m.who !== OTHER && (
                  <CheckField label="Can suggest changes to this project" checked={m.can_edit}
                    onChange={(can_edit) => setMember(m.key, { can_edit })} />
                )}
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={secondaryButtonClass} disabled={i === 0} onClick={() => moveMember(i, -1)}>
                    Move up
                  </button>
                  <button type="button" className={secondaryButtonClass} disabled={i === members.length - 1}
                    onClick={() => moveMember(i, 1)}>
                    Move down
                  </button>
                  <button type="button" className={secondaryButtonClass}
                    onClick={() => setMembers((rows) => rows.filter((row) => row.key !== m.key))}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className={`${secondaryButtonClass} w-fit`}
            onClick={() => setMembers((rows) => [
              ...rows,
              { key: crypto.randomUUID(), who: "", external_name: "", role: "", term: "", can_edit: false },
            ])}
          >
            Add a team member
          </button>
        </Fieldset>

        <Fieldset legend="Advisors and partners">
          {options.faculty.length > 0 && (
            <div>
              <p className="font-medium">Faculty advisors</p>
              {options.faculty.map((f) => (
                <CheckField key={f.id} label={f.name} checked={advisorIds.includes(f.id)}
                  onChange={(on) => setAdvisorIds((list) => toggle(list, f.id, on))} />
              ))}
            </div>
          )}
          {options.organizations.length > 0 && (
            <div>
              <p className="font-medium">Partner organizations and grants</p>
              {options.organizations.map((o) => (
                <CheckField key={o.id} label={`${o.name} (${o.type === "grant" ? "grant" : "organization"})`}
                  checked={organizationIds.includes(o.id)}
                  onChange={(on) => setOrganizationIds((list) => toggle(list, o.id, on))} />
              ))}
            </div>
          )}
          <p className="text-sm text-muted">
            Advisor or partner missing? Ask the department office to add them, then edit the project.
          </p>
        </Fieldset>

        <Fieldset legend="Links and contact" description="Public links only, starting with https://">
          <TextField label="Source code" type="url" value={repoUrl} onChange={setRepoUrl} pattern="https://.*" />
          <TextField label="Live demo" type="url" value={demoUrl} onChange={setDemoUrl} pattern="https://.*" />
          <TextField label="Poster" type="url" value={posterUrl} onChange={setPosterUrl} pattern="https://.*" />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Contact email" type="email" value={contactEmail} onChange={setContactEmail} maxLength={254}
              hint="A faculty member or the department office." />
            <TextField label="Contact phone" type="tel" value={contactPhone} onChange={setContactPhone} maxLength={25}
              pattern={"[0-9+\\(\\)\\. \\-]{7,25}"} hint="A faculty or office number." />
          </div>
          <SelectField label="Or a student on the team as the contact" value={contactStudent} onChange={setContactStudent}
            placeholder="No student contact"
            options={teamStudents.map((m) => ({ value: m.who, label: studentNames.get(m.who) ?? "Team member" }))}
            hint="Only the contact details that student chose to show on their profile appear." />
        </Fieldset>

        <Fieldset legend="Photos" description="Good photos do more for a project page than anything else. Only use photos where everyone recognizable has agreed.">
          <PhotoField label="Thumbnail" value={thumbnail} onChange={setThumbnail} previewAlt={thumbnailAlt || "Thumbnail"}
            hint="The picture on project cards and in the carousel. Landscape works best." />
          {(thumbnail.path || thumbnail.file) && (
            <TextField label="Thumbnail alt text" required value={thumbnailAlt} onChange={setThumbnailAlt} maxLength={300}
              hint="One sentence describing the photo for people who can't see it." />
          )}
          <div className="flex flex-col gap-2">
            <p className="font-medium">Gallery</p>
            <GalleryField items={gallery} onChange={setGallery} />
          </div>
        </Fieldset>

        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" className={buttonClass} disabled={busy}>
            {busy ? "Sending…" : change ? "Send back for review" : project ? "Send changes for review" : "Send for review"}
          </button>
          {project && !change && <RemoveProject projectId={project.id} title={project.title} />}
        </div>
      </form>
    </div>
  );
}

function RemoveProject({ projectId, title }: { projectId: string; title: string }) {
  const navigate = useNavigate();
  const { busy, error, run } = useAction();
  return (
    <>
      <button
        type="button"
        className={secondaryButtonClass}
        disabled={busy}
        onClick={() => {
          if (!window.confirm(`Ask a reviewer to remove ${title} from the site?`)) return;
          void run(async () => {
            await submitChange({ target_type: "project", action: "delete", target_id: projectId });
            navigate("/account", { state: { message: "Your request to remove the project was sent for review." } });
          });
        }}
      >
        Ask to remove this project
      </button>
      {error && <Notice tone="error">{error}</Notice>}
    </>
  );
}
