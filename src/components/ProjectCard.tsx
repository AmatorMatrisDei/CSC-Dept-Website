import { Link } from "react-router";
import Cover from "@/components/Cover";
import { peopleLine } from "@/lib/format";
import type { ProjectView, Status } from "@/lib/types";

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className="inline-block rounded-full border border-border px-2.5 py-0.5 text-xs font-medium">
      {status}
    </span>
  );
}

export default function ProjectCard({ project }: { project: ProjectView }) {
  const people = peopleLine(project);
  return (
    <article className="lift group relative flex w-full flex-col overflow-hidden rounded-lg border border-border bg-surface">
      <Cover src={project.thumbnail?.url ?? null} alt={project.thumbnail?.alt ?? ""} label={project.title} />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-2">
          <StatusBadge status={project.status} />
          <span className="text-xs text-muted">{project.sub_department.name}</span>
        </div>
        <h2 className="text-lg font-semibold">
          <Link to={`/projects/${project.slug}`} className="after:absolute after:inset-0 hover:underline">
            {project.title}
          </Link>
        </h2>
        <p className="text-sm text-muted">{project.summary}</p>
        {people && <p className="mt-auto pt-2 text-xs text-muted">{people}</p>}
      </div>
    </article>
  );
}
