import { Link, useParams } from "react-router";
import Portrait from "@/components/Portrait";
import ProjectCard from "@/components/ProjectCard";
import { getFaculty } from "@/lib/content";
import { useAsync, useTitle } from "@/lib/hooks";
import NotFound from "@/pages/NotFound";

export default function FacultyMember() {
  const { slug = "" } = useParams();
  const person = useAsync(getFaculty, slug);
  useTitle(person?.name ?? "Faculty");

  if (person === undefined) return <p className="text-muted">Loading…</p>;
  if (person === null) return <NotFound what="faculty member" />;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Link to="/faculty" className="inline-flex min-h-11 w-fit items-center text-sm underline">
          All faculty
        </Link>
        <Portrait src={person.photo?.url} alt={person.photo?.alt ?? ""} name={person.name} className="size-28 text-3xl" />
        <h1 className="text-3xl font-semibold">{person.name}</h1>
        <p className="text-muted">{person.title}</p>
        {person.email && (
          <a href={`mailto:${person.email}`} className="inline-flex min-h-11 w-fit items-center underline">
            {person.email}
          </a>
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
