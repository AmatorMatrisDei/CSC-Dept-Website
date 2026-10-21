import { Link, useParams } from "react-router";
import Editable from "@/components/Editable";
import EditablePortrait from "@/components/EditablePortrait";
import QuickView from "@/components/QuickView";
import { facultyQuickInfo } from "@/lib/quickInfo";
import ProjectCard from "@/components/ProjectCard";
import { useEdit } from "@/lib/edit";
import { getFaculty } from "@/lib/content";
import { useReloadable, useTitle } from "@/lib/hooks";
import { saveRecordDraft, useRecordDraft, withFacultyDraft } from "@/lib/recordDrafts";
import NotFound from "@/pages/NotFound";

export default function FacultyMember() {
  const { slug = "" } = useParams();
  const { editing } = useEdit();
  const [live] = useReloadable(getFaculty, slug);
  const draft = useRecordDraft("faculty", slug);
  useTitle(live?.name ?? "Faculty");

  if (live === undefined) return <p className="text-muted">Loading…</p>;
  if (live === null) return <NotFound what="faculty member" />;
  const person = editing ? withFacultyDraft(live, draft) : live;

  // Edits are saved as a draft and go live when an editor publishes.
  function save(patch: Record<string, unknown>) {
    return saveRecordDraft("faculty", slug, patch, undefined, live?.date_updated);
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Link to="/faculty" className="inline-flex min-h-11 w-fit items-center text-sm underline">
          All faculty
        </Link>
        <div className="w-fit">
          {editing ? (
            <EditablePortrait table="faculty" person={person} live={live} />
          ) : (
            <QuickView person={facultyQuickInfo(person, false)} className="size-28 text-3xl" />
          )}
        </div>
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
