import { Link } from "react-router";
import Carousel from "@/components/Carousel";
import ProjectBrowser from "@/components/ProjectBrowser";
import { getAllFaculty, getCarouselProjects, getProjects, getSubDepartments } from "@/lib/content";
import { useAsync, useTitle } from "@/lib/hooks";

export default function Home() {
  useTitle(undefined);
  const featured = useAsync(getCarouselProjects);
  const projects = useAsync(getProjects);
  const departments = useAsync(getSubDepartments);
  const advisors = useAsync(getAllFaculty);

  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold sm:text-4xl">Engineering &amp; Computing</h1>
        <p className="max-w-2xl text-muted">
          See what our students and faculty are building, from capstones and class projects to
          internships and partner work.
        </p>
        <div>
          <Link
            to="/projects"
            className="inline-flex min-h-11 items-center rounded bg-accent px-4 text-accent-foreground"
          >
            Browse all projects
          </Link>
        </div>
      </section>

      <section aria-labelledby="featured" className="flex flex-col gap-4">
        <h2 id="featured" className="text-2xl font-semibold">
          Featured projects
        </h2>
        {featured ? <Carousel projects={featured} /> : <p className="text-muted">Loading…</p>}
      </section>

      <section aria-labelledby="find" className="flex flex-col gap-4">
        <h2 id="find" className="text-2xl font-semibold">
          Find a project
        </h2>
        {projects && departments && advisors ? (
          <ProjectBrowser
            projects={projects}
            departments={departments}
            advisors={advisors}
            filters={["advisor", "department"]}
          />
        ) : (
          <p className="text-muted">Loading projects…</p>
        )}
      </section>
    </div>
  );
}
