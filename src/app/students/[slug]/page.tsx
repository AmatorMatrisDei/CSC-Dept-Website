import Link from "next/link";
import { notFound } from "next/navigation";
import Cover from "@/components/Cover";
import { StatusBadge } from "@/components/ProjectCard";
import { getStudent, getStudents } from "@/lib/content";
import { paragraphs } from "@/lib/format";

export async function generateStaticParams() {
  return (await getStudents()).map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: PageProps<"/students/[slug]">) {
  const { slug } = await params;
  return { title: (await getStudent(slug))?.name ?? "Student" };
}

export default async function StudentPage({ params }: PageProps<"/students/[slug]">) {
  const { slug } = await params;
  const student = await getStudent(slug);
  if (!student) notFound();

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Link href="/students" className="inline-flex min-h-11 w-fit items-center text-sm underline">
          All students
        </Link>
        {student.photo && (
          <div className="w-40">
            <Cover src={student.photo.url} alt={student.photo.alt} />
          </div>
        )}
        <h1 className="text-3xl font-semibold">{student.name}</h1>
        <p className="text-muted">
          {student.major === "CSC" ? "Computer Science" : "Engineering"} · Class of {student.class_year}
        </p>
        <div className="flex flex-wrap gap-x-4">
          <a href={`mailto:${student.email}`} className="inline-flex min-h-11 items-center underline">
            {student.email}
          </a>
          {student.linkedin_url && (
            <a href={student.linkedin_url} className="inline-flex min-h-11 items-center underline">
              LinkedIn
            </a>
          )}
        </div>
      </header>

      {student.background && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Background</h2>
          {paragraphs(student.background).map((text, i) => (
            <p key={i}>{text}</p>
          ))}
        </section>
      )}

      {(student.skills.length > 0 || student.clubs_roles.length > 0) && (
        <div className="grid gap-6 sm:grid-cols-2">
          {student.skills.length > 0 && (
            <section>
              <h2 className="text-xl font-semibold">Skills</h2>
              <p>{student.skills.join(", ")}</p>
            </section>
          )}
          {student.clubs_roles.length > 0 && (
            <section>
              <h2 className="text-xl font-semibold">Clubs and roles</h2>
              <ul className="list-disc pl-5">
                {student.clubs_roles.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
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
                <Link href={`/projects/${project.slug}`} className="inline-flex min-h-11 items-center underline">
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
