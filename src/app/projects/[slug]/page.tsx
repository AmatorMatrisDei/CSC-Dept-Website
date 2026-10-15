import Link from "next/link";
import { notFound } from "next/navigation";
import Cover from "@/components/Cover";
import { StatusBadge } from "@/components/ProjectCard";
import { getProject, getProjects } from "@/lib/content";
import { formatDate, paragraphs } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/types";

export async function generateStaticParams() {
  return (await getProjects()).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/projects/[slug]">) {
  const { slug } = await params;
  const project = await getProject(slug);
  return { title: project?.title ?? "Project" };
}

export default async function ProjectPage({ params }: PageProps<"/projects/[slug]">) {
  const { slug } = await params;
  const project = await getProject(slug);
  if (!project) notFound();

  const photos = project.images.length ? project.images : project.thumbnail ? [project.thumbnail] : [];

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <p className="text-sm">
          <Link href="/projects" className="inline-flex min-h-11 items-center underline">
            All projects
          </Link>
        </p>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <StatusBadge status={project.status} />
          <span>{project.sub_department.name}</span>
          <span aria-hidden="true">·</span>
          <span>{CATEGORY_LABELS[project.category]}</span>
        </div>
        <h1 className="text-3xl font-semibold sm:text-4xl">{project.title}</h1>
        <p className="text-muted">{project.summary}</p>
        {project.open_to_contributors && (
          <p className="w-fit rounded border border-border px-3 py-1 text-sm">Open to contributors</p>
        )}
      </header>

      {photos.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2">
          {photos.map((photo) => (
            <li key={photo.url}>
              <Cover src={photo.url} alt={photo.alt} />
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-8 md:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">About this project</h2>
          {paragraphs(project.description).map((text, i) => (
            <p key={i}>{text}</p>
          ))}
        </div>

        <aside className="flex flex-col gap-6" aria-label="Project details">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">Started</dt>
            <dd>{project.date_started ? formatDate(project.date_started) : "Not set"}</dd>
            {project.date_finished && (
              <>
                <dt className="text-muted">Finished</dt>
                <dd>{formatDate(project.date_finished)}</dd>
              </>
            )}
            <dt className="text-muted">Updated</dt>
            <dd>{formatDate(project.date_updated)}</dd>
          </dl>

          {project.advisors.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold">Faculty advisors</h2>
              <ul>
                {project.advisors.map((a) => (
                  <li key={a.slug}>
                    <Link href={`/faculty/${a.slug}`} className="inline-flex min-h-11 items-center underline">
                      {a.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {project.members.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold">Team</h2>
              <ul>
                {project.members.map(({ student, role }) => (
                  <li key={student.slug}>
                    <Link href={`/students/${student.slug}`} className="inline-flex min-h-11 items-center underline">
                      {student.name}
                    </Link>{" "}
                    <span className="text-sm text-muted">{role}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(project.contact_email || project.contact_phone || project.links.length > 0) && (
            <section>
              <h2 className="text-lg font-semibold">Contact and links</h2>
              <ul>
                {project.contact_email && (
                  <li>
                    <a href={`mailto:${project.contact_email}`} className="inline-flex min-h-11 items-center underline">
                      {project.contact_email}
                    </a>
                  </li>
                )}
                {project.contact_phone && <li className="min-h-11 py-2">{project.contact_phone}</li>}
                {project.links.map((link) => (
                  <li key={link.url}>
                    <a href={link.url} className="inline-flex min-h-11 items-center underline">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </article>
  );
}
