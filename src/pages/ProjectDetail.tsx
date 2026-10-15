import { Link, useParams } from "react-router";
import Cover from "@/components/Cover";
import { StatusBadge } from "@/components/ProjectCard";
import { getProject } from "@/lib/content";
import { formatDate, paragraphs } from "@/lib/format";
import { useAsync, useTitle } from "@/lib/hooks";
import { CATEGORY_LABELS } from "@/lib/types";
import NotFound from "@/pages/NotFound";

export default function ProjectDetail() {
  const { slug = "" } = useParams();
  const project = useAsync(getProject, slug);
  useTitle(project?.title ?? "Project");

  if (project === undefined) return <p className="text-muted">Loading…</p>;
  if (project === null) return <NotFound what="project" />;

  const photos = project.images.length ? project.images : project.thumbnail ? [project.thumbnail] : [];

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <p className="text-sm">
          <Link to="/projects" className="inline-flex min-h-11 items-center underline">
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

      <ul className="grid gap-4 sm:grid-cols-2">
        {photos.length === 0 ? (
          <li>
            <Cover src={null} alt="" label={project.title} />
          </li>
        ) : (
          photos.map((photo) => (
            <li key={photo.url}>
              <Cover src={photo.url} alt={photo.alt} />
            </li>
          ))
        )}
      </ul>

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
                    <Link to={`/faculty/${a.slug}`} className="inline-flex min-h-11 items-center underline">
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
                {project.members.map(({ name, slug: studentSlug, role }) => (
                  <li key={`${name}-${role}`} className="flex min-h-11 flex-wrap items-center gap-x-2">
                    {studentSlug ? (
                      <Link to={`/students/${studentSlug}`} className="underline">
                        {name}
                      </Link>
                    ) : (
                      <span>{name}</span>
                    )}
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
