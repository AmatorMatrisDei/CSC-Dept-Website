import { useState } from "react";
import { Link, useParams } from "react-router";
import Editable from "@/components/Editable";
import Portrait from "@/components/Portrait";
import ProjectCard from "@/components/ProjectCard";
import { useEdit } from "@/lib/edit";
import { getFaculty, saveFaculty } from "@/lib/content";
import { useAsync, useTitle } from "@/lib/hooks";
import NotFound from "@/pages/NotFound";

// `version` only changes after a staff save, so the page then loads the fresh copy.
const loadFaculty = (slug: string, version: number) => (version < 0 ? Promise.resolve(null) : getFaculty(slug));

export default function FacultyMember() {
  const { slug = "" } = useParams();
  const { editing } = useEdit();
  const [version, setVersion] = useState(0);
  const person = useAsync(loadFaculty, slug, version);
  useTitle(person?.name ?? "Faculty");

  if (person === undefined) return <p className="text-muted">Loading…</p>;
  if (person === null) return <NotFound what="faculty member" />;

  async function save(patch: Parameters<typeof saveFaculty>[1]) {
    const error = await saveFaculty(slug, patch);
    if (!error) setVersion((v) => v + 1);
    return error;
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Link to="/faculty" className="inline-flex min-h-11 w-fit items-center text-sm underline">
          All faculty
        </Link>
        <Portrait src={person.photo?.url} alt={person.photo?.alt ?? ""} name={person.name} className="size-28 text-3xl" />
        <Editable as="h1" label="name" value={person.name} maxLength={120} onSave={(name) => save({ name })} className="text-3xl font-semibold" />
        <Editable as="p" label="title" value={person.title} maxLength={200} onSave={(title) => save({ title })} className="text-muted" />
        {editing ? (
          <Editable label="email" value={person.email ?? ""} maxLength={200} onSave={(v) => save({ email: v.trim() || null })} className="inline-flex min-h-11 w-fit items-center underline" />
        ) : (
          person.email && (
            <a href={`mailto:${person.email}`} className="inline-flex min-h-11 w-fit items-center underline">
              {person.email}
            </a>
          )
        )}
      </header>

      <section aria-labelledby="advised" className="flex flex-col gap-4">
        <h2 id="advised" className="text-2xl font-semibold">
          Advised projects
        </h2>
        {person.projects.length === 0 ? (
          <p className="text-muted">No projects listed yet.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {person.projects.map((project) => (
              <li key={project.slug} className="flex">
                <ProjectCard project={project} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
