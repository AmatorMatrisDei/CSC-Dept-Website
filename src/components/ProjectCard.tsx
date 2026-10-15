import Link from "next/link";
import Cover from "@/components/Cover";
import type { ProjectView, Status } from "@/lib/types";

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className="inline-block rounded-full border border-border px-2.5 py-0.5 text-xs font-medium">
      {status}
    </span>
  );
}

// "A, B and C" style list of the people on a project, for cards.
export function peopleLine(project: ProjectView): string {
  const names = [...project.members.map((m) => m.student.name), ...project.advisors.map((a) => a.name)];
  return names.join(", ");
}

export default function ProjectCard({ project }: { project: ProjectView }) {
  const people = peopleLine(project);
  return (
    <article className="flex w-full flex-col overflow-hidden rounded-lg border border-border bg-surface">
      <Cover src={project.thumbnail?.url ?? null} alt={project.thumbnail?.alt ?? ""} />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-2">
          <StatusBadge status={project.status} />
          <span className="text-xs text-muted">{project.sub_department.name}</span>
        </div>
        <h2 className="text-lg font-semibold">
          <Link href={`/projects/${project.slug}`} className="hover:underline">
            {project.title}
          </Link>
        </h2>
        <p className="text-sm text-muted">{project.summary}</p>
        {people && <p className="mt-auto pt-2 text-xs text-muted">{people}</p>}
      </div>
    </article>
  );
}
