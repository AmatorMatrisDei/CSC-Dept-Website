import { Suspense } from "react";
import ProjectBrowser from "@/components/ProjectBrowser";
import { getAllFaculty, getProjects, getSubDepartments } from "@/lib/content";

export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const [projects, departments, advisors] = await Promise.all([
    getProjects(),
    getSubDepartments(),
    getAllFaculty(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">Projects</h1>
      <Suspense fallback={<p className="text-muted">Loading projects…</p>}>
        <ProjectBrowser
          projects={projects}
          departments={departments}
          advisors={advisors}
          filters={["category", "status", "department", "year", "advisor"]}
        />
      </Suspense>
    </div>
  );
}
