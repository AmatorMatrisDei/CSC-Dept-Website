import ProjectBrowser from "@/components/ProjectBrowser";
import { getAllFaculty, getProjects, getSubDepartments } from "@/lib/content";
import { useAsync, useTitle } from "@/lib/hooks";

export default function Projects() {
  useTitle("Projects");
  const projects = useAsync(getProjects);
  const departments = useAsync(getSubDepartments);
  const advisors = useAsync(getAllFaculty);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">Projects</h1>
      {projects && departments && advisors ? (
        <ProjectBrowser
          projects={projects}
          departments={departments}
          advisors={advisors}
          filters={["category", "status", "department", "year", "advisor"]}
        />
      ) : (
        <p className="text-muted">Loading projects…</p>
      )}
    </div>
  );
}
