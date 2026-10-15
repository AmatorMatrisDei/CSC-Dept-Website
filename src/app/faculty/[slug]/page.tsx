import Link from "next/link";
import { notFound } from "next/navigation";
import ProjectCard from "@/components/ProjectCard";
import { getAllFaculty, getFaculty } from "@/lib/content";

export async function generateStaticParams() {
  return (await getAllFaculty()).map((f) => ({ slug: f.slug }));
}

export async function generateMetadata({ params }: PageProps<"/faculty/[slug]">) {
  const { slug } = await params;
  return { title: (await getFaculty(slug))?.name ?? "Faculty" };
}

export default async function FacultyMember({ params }: PageProps<"/faculty/[slug]">) {
  const { slug } = await params;
  const person = await getFaculty(slug);
  if (!person) notFound();

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Link href="/faculty" className="inline-flex min-h-11 w-fit items-center text-sm underline">
          All faculty
        </Link>
        <h1 className="text-3xl font-semibold">{person.name}</h1>
        <p className="text-muted">{person.title}</p>
        <a href={`mailto:${person.email}`} className="inline-flex min-h-11 w-fit items-center underline">
          {person.email}
        </a>
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
