import { Link } from "react-router";
import ProjectBrowser from "@/components/ProjectBrowser";
import SiteText from "@/components/SiteText";
import { getAllFaculty, getProjects, getSubDepartments } from "@/lib/content";
import { useAsync, useTitle } from "@/lib/hooks";
import { usePreloadMotion } from "@/lib/motion";

export default function Projects() {
  useTitle("Projects");
  usePreloadMotion();
  const projects = useAsync(getProjects);
  const departments = useAsync(getSubDepartments);
  const advisors = useAsync(getAllFaculty);

  return (
    <div className="flex flex-col gap-6">
      <SiteText id="projects.title" as="h1" fallback="Projects" className="text-3xl font-semibold" />
      <p className="text-muted">
        Have a project to show?{" "}
        <Link to="/account/projects/new" className="underline">
          Submit a project
        </Link>
      </p>
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
