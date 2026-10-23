import { lazy, Suspense, useEffect } from "react";
import { Link, useParams } from "react-router";
import ClickToReplace from "@/components/ClickToReplace";
import Cover from "@/components/Cover";
import Editable from "@/components/Editable";
import HighlightSwitch from "@/components/HighlightSwitch";
import ProjectPhotos from "@/components/ProjectPhotos";
import { StatusBadge } from "@/components/ProjectCard";
import { useEdit } from "@/lib/edit";
import { getProject } from "@/lib/content";
import { formatDate, paragraphs } from "@/lib/format";
import { replaceGalleryPhoto, setCoverPhoto } from "@/lib/projectPhotos";
import { useReloadable, useTitle } from "@/lib/hooks";
import { isDrafted, saveRecordDraft, useRecordDraft, useReloadOnPublish, withProjectDraft } from "@/lib/recordDrafts";
import { CATEGORY_LABELS } from "@/lib/types";
import NotFound from "@/pages/NotFound";

// Descriptions are Markdown. The renderer loads with the first project page a visitor opens;
// until it arrives, or if it can't load, the description shows as plain paragraphs.
const loadMarkdown = () => import("@/components/Markdown");
const Markdown = lazy(() => loadMarkdown().catch(() => ({ default: PlainText })));

function PlainText({ text }: { text: string }) {
  return (
    <>
      {paragraphs(text).map((paragraph, i) => (
        <p key={i}>{paragraph}</p>
      ))}
    </>
  );
}

export default function ProjectDetail() {
  const { slug = "" } = useParams();
  const { editing } = useEdit();
  const [live, reload] = useReloadable(getProject, slug);
  useReloadOnPublish(reload);
  const draft = useRecordDraft("projects", slug);
  useTitle(live?.title ?? "Project");
  // Start fetching the Markdown renderer while the project loads.
  useEffect(() => {
    loadMarkdown().catch(() => {});
  }, []);

  // Edits are saved as a draft and go live when an editor publishes.
  function save(patch: Record<string, unknown>) {
    return saveRecordDraft("projects", slug, patch, undefined, live?.date_updated);
  }

  if (live === undefined) return <p className="text-muted">Loading…</p>;
  if (live === null) return <NotFound what="project" />;
  const project = editing ? withProjectDraft(live, draft) : live;

  const photos = project.images.length ? project.images : project.thumbnail ? [project.thumbnail] : [];

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-sm">
            <Link to="/projects" className="inline-flex min-h-11 items-center underline">
              All projects
            </Link>
          </p>
          {editing && <HighlightSwitch kind="project" refId={project.id} />}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <StatusBadge status={project.status} />
          <span>{project.sub_department.name}</span>
          <span aria-hidden="true">·</span>
          <span>{CATEGORY_LABELS[project.category]}</span>
        </div>
        <Editable as="h1" label="title" drafted={isDrafted(draft, "title")} value={project.title} maxLength={200} onSave={(title) => save({ title })} className="text-3xl font-semibold sm:text-4xl" />
        <Editable as="p" label="summary" drafted={isDrafted(draft, "summary")} value={project.summary} multiline maxLength={500} onSave={(summary) => save({ summary })} className="text-muted" />
        {project.open_to_contributors && (
          <p className="w-fit rounded border border-border px-3 py-1 text-sm">Open to contributors</p>
        )}
      </header>

      <ul className="grid gap-4 sm:grid-cols-2">
        {photos.length === 0 ? (
          <li>
            {editing ? (
              <ClickToReplace label="Add a photo" onPick={(file) => setCoverPhoto(project, live, file, project.title)}>
                <Cover src={null} alt="" label={project.title} />
              </ClickToReplace>
            ) : (
              <Cover src={null} alt="" label={project.title} />
            )}
          </li>
        ) : (
          photos.map((photo, i) => (
            <li key={photo.url}>
              <figure className="flex flex-col gap-2">
                {editing ? (
                  <ClickToReplace
                    label="Replace photo"
                    onPick={(file) =>
                      project.images.length
                        ? replaceGalleryPhoto(project, live, project.image_paths[i], file)
                        : setCoverPhoto(project, live, file, photo.alt || project.title)
                    }
                  >
                    <Cover src={photo.url} alt={photo.alt} />
                  </ClickToReplace>
                ) : (
                  <Cover src={photo.url} alt={photo.alt} />
                )}
                {photo.caption && <figcaption className="text-sm text-muted">{photo.caption}</figcaption>}
              </figure>
            </li>
          ))
        )}
      </ul>

      {editing && <ProjectPhotos project={project} live={live} />}

      <div className="grid gap-8 md:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">About this project</h2>
          <Editable as="div" label="description" drafted={isDrafted(draft, "description")} value={project.description} multiline maxLength={20000} onSave={(description) => save({ description })} className="flex flex-col gap-4">
            <Suspense fallback={<PlainText text={project.description} />}>
              <Markdown text={project.description} />
            </Suspense>
          </Editable>
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

          {(editing || project.contact_email || project.contact_phone || project.links.length > 0) && (
            <section>
              <h2 className="text-lg font-semibold">Contact and links</h2>
              <ul>
                {editing ? (
                  <li>
                    <Editable
                      as="span"
                      label="contact email"
                      value={project.contact_email ?? ""}
                      maxLength={200}
                      onSave={(v) => save({ primary_contact_email: v.trim() || null })}
                      className="inline-flex min-h-11 items-center underline"
                    />
                  </li>
                ) : (
                  project.contact_email && (
                    <li>
                      <a href={`mailto:${project.contact_email}`} className="inline-flex min-h-11 items-center underline">
                        {project.contact_email}
                      </a>
                    </li>
                  )
                )}
                {project.contact_phone && (
                  <li>
                    <a href={`tel:${project.contact_phone.replace(/[^\d+]/g, "")}`} className="inline-flex min-h-11 items-center underline">
                      {project.contact_phone}
                    </a>
                  </li>
                )}
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
