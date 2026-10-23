import { Link, useParams } from "react-router";
import Editable from "@/components/Editable";
import HighlightSwitch from "@/components/HighlightSwitch";
import EditablePortrait from "@/components/EditablePortrait";
import QuickView from "@/components/QuickView";
import { studentLinks, studentQuickInfo } from "@/lib/quickInfo";
import { StatusBadge } from "@/components/ProjectCard";
import { useEdit } from "@/lib/edit";
import { getStudent } from "@/lib/content";
import { paragraphs } from "@/lib/format";
import { useReloadable, useTitle } from "@/lib/hooks";
import { splitLines, splitList } from "@/lib/list";
import { isDrafted, saveRecordDraft, useRecordDraft, useReloadOnPublish, withStudentDraft } from "@/lib/recordDrafts";
import NotFound from "@/pages/NotFound";

export default function StudentPage() {
  const { slug = "" } = useParams();
  const { editing } = useEdit();
  const [live, reload] = useReloadable(getStudent, slug);
  useReloadOnPublish(reload);
  const draft = useRecordDraft("profiles", slug);
  useTitle(live?.name ?? "Student");

  if (live === undefined) return <p className="text-muted">Loading…</p>;
  if (live === null) return <NotFound what="student" />;
  const student = editing ? withStudentDraft(live, draft) : live;

  // Edits are saved as a draft and go live when an editor publishes.
  function save(patch: Record<string, unknown>) {
    return saveRecordDraft("profiles", slug, patch, undefined, live?.date_updated);
  }

  const link = "inline-flex min-h-11 items-center underline";

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Link to="/students" className="inline-flex min-h-11 w-fit items-center text-sm underline">
          All students
        </Link>
        <div className="w-fit">
          {editing ? (
            <EditablePortrait table="profiles" person={student} live={live} />
          ) : (
            <QuickView person={studentQuickInfo(student, false)} className="size-28 text-3xl" />
          )}
        </div>
        <Editable as="h1" label="name" drafted={isDrafted(draft, "name")} value={student.name} maxLength={120} onSave={(name) => save({ name })} className="text-3xl font-semibold" />
        <Editable as="p" label="headline" drafted={isDrafted(draft, "headline")} value={student.headline} maxLength={200} onSave={(headline) => save({ headline })} className="text-muted" />
        {(student.major || editing) && (
          <Editable as="p" label="major" value={student.major ?? ""} maxLength={100} onSave={(v) => save({ major: v.trim() || null })} className="text-sm" />
        )}
        <div className="flex flex-wrap gap-x-4">
          {editing ? (
            <>
              <Editable label="email" value={student.email ?? ""} maxLength={200} onSave={(v) => save({ contact_email: v.trim() || null })} className={link} />
              <Editable label="phone" value={student.phone ?? ""} maxLength={25} onSave={(v) => save({ contact_phone: v.trim() || null })} className={link} />
              <Editable label="LinkedIn address (https://…)" value={student.linkedin_url ?? ""} maxLength={300} onSave={(v) => save({ linkedin_url: v.trim() || null })} className={link} />
              <Editable label="GitHub address (https://…)" value={student.github_url ?? ""} maxLength={300} onSave={(v) => save({ github_url: v.trim() || null })} className={link} />
              <Editable label="website address (https://…)" value={student.website_url ?? ""} maxLength={300} onSave={(v) => save({ website_url: v.trim() || null })} className={link} />
            </>
          ) : (
            <>
              {student.email && (
                <a href={`mailto:${student.email}`} className={link}>
                  {student.email}
                </a>
              )}
              {student.phone && (
                <a href={`tel:${student.phone.replace(/[^\d+]/g, "")}`} className={link}>
                  {student.phone}
                </a>
              )}
              {studentLinks(student).map((l) => (
                <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className={link}>
                  {l.label}
                </a>
              ))}
            </>
          )}
        </div>
      </header>

      {(student.background || editing) && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Background</h2>
          <Editable as="div" label="background" drafted={isDrafted(draft, "background")} value={student.background} multiline maxLength={5000} onSave={(background) => save({ background })} className="flex flex-col gap-3">
            {paragraphs(student.background).map((text, i) => (
              <p key={i}>{text}</p>
            ))}
          </Editable>
        </section>
      )}

      {(editing || student.skills.length > 0 || student.clubs_roles.length > 0) && (
        <div className="grid gap-6 sm:grid-cols-2">
          {(editing || student.skills.length > 0) && (
            <section>
              <h2 className="text-xl font-semibold">Skills</h2>
              <Editable label="skills (separate with commas)" value={student.skills.join(", ")} maxLength={500} onSave={(v) => save({ skills: splitList(v) })} />
            </section>
          )}
          {(editing || student.clubs_roles.length > 0) && (
            <section>
              <h2 className="text-xl font-semibold">Clubs and roles</h2>
              {editing ? (
                <Editable label="clubs and roles (one per line)" value={student.clubs_roles.join("\n")} multiline maxLength={2000} onSave={(v) => save({ clubs_roles: splitLines(v) })} />
              ) : (
                <ul className="list-disc pl-5">
                  {student.clubs_roles.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}

      {editing && <HighlightSwitch kind="student" refId={student.id} />}

      <section aria-labelledby="projects" className="flex flex-col gap-2">
        <h2 id="projects" className="text-xl font-semibold">
          Projects
        </h2>
        {student.projects.length === 0 ? (
          <p className="text-muted">No projects listed yet.</p>
        ) : (
          <ul>
            {student.projects.map(({ project, role }) => (
              <li key={project.slug} className="flex flex-wrap items-center gap-2">
                <Link to={`/projects/${project.slug}`} className="inline-flex min-h-11 items-center underline">
                  {project.title}
                </Link>
                <span className="text-sm text-muted">{role}</span>
                <StatusBadge status={project.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
