import { useState } from "react";
import { Link, useParams } from "react-router";
import Editable from "@/components/Editable";
import Portrait from "@/components/Portrait";
import { StatusBadge } from "@/components/ProjectCard";
import { useEdit } from "@/lib/edit";
import { getStudent, saveStudent } from "@/lib/content";
import { paragraphs } from "@/lib/format";
import { useAsync, useTitle } from "@/lib/hooks";
import { splitList } from "@/lib/list";
import NotFound from "@/pages/NotFound";

// `version` only changes after a staff save, so the page then loads the fresh copy.
const loadStudent = (slug: string, version: number) => (version < 0 ? Promise.resolve(null) : getStudent(slug));

export default function StudentPage() {
  const { slug = "" } = useParams();
  const { editing } = useEdit();
  const [version, setVersion] = useState(0);
  const student = useAsync(loadStudent, slug, version);
  useTitle(student?.name ?? "Student");

  if (student === undefined) return <p className="text-muted">Loading…</p>;
  if (student === null) return <NotFound what="student" />;

  async function save(patch: Parameters<typeof saveStudent>[1]) {
    const error = await saveStudent(slug, patch);
    if (!error) setVersion((v) => v + 1);
    return error;
  }

  const link = "inline-flex min-h-11 items-center underline";

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Link to="/students" className="inline-flex min-h-11 w-fit items-center text-sm underline">
          All students
        </Link>
        <Portrait src={student.photo?.url} alt={student.photo?.alt ?? ""} name={student.name} className="size-28 text-3xl" />
        <Editable as="h1" label="name" value={student.name} maxLength={120} onSave={(name) => save({ name })} className="text-3xl font-semibold" />
        <Editable as="p" label="headline" value={student.headline} maxLength={200} onSave={(headline) => save({ headline })} className="text-muted" />
        {(student.major || editing) && (
          <Editable as="p" label="major" value={student.major ?? ""} maxLength={100} onSave={(v) => save({ major: v.trim() || null })} className="text-sm" />
        )}
        <div className="flex flex-wrap gap-x-4">
          {editing ? (
            <>
              <Editable label="email" value={student.email ?? ""} maxLength={200} onSave={(v) => save({ contact_email: v.trim() || null })} className={link} />
              <Editable label="LinkedIn address (https://…)" value={student.linkedin_url ?? ""} maxLength={300} onSave={(v) => save({ linkedin_url: v.trim() || null })} className={link} />
            </>
          ) : (
            <>
              {student.email && (
                <a href={`mailto:${student.email}`} className={link}>
                  {student.email}
                </a>
              )}
              {student.linkedin_url && (
                <a href={student.linkedin_url} className={link}>
                  LinkedIn
                </a>
              )}
            </>
          )}
        </div>
      </header>

      {(student.background || editing) && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Background</h2>
          <Editable as="div" label="background" value={student.background} multiline maxLength={5000} onSave={(background) => save({ background })} className="flex flex-col gap-3">
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
                <Editable label="clubs and roles (separate with commas)" value={student.clubs_roles.join(", ")} maxLength={500} onSave={(v) => save({ clubs_roles: splitList(v) })} />
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
