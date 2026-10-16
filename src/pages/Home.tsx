import { Link } from "react-router";
import Carousel from "@/components/Carousel";
import ProjectBrowser from "@/components/ProjectBrowser";
import SiteText from "@/components/SiteText";
import { getAllFaculty, getCarouselProjects, getProjects, getSubDepartments } from "@/lib/content";
import { useAsync, useTitle } from "@/lib/hooks";
import { usePreloadMotion } from "@/lib/motion";

export default function Home() {
  useTitle(undefined);
  usePreloadMotion();
  const featured = useAsync(getCarouselProjects);
  const projects = useAsync(getProjects);
  const departments = useAsync(getSubDepartments);
  const advisors = useAsync(getAllFaculty);

  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-3">
        <SiteText id="home.title" as="h1" fallback="Engineering & Computing" className="text-3xl font-semibold sm:text-4xl" />
        <SiteText
          id="home.intro"
          fallback="See what our students and faculty are building, from capstones and class projects to internships and partner work."
          className="max-w-2xl text-muted"
        />
        <div>
          <Link
            to="/projects"
            className="inline-flex min-h-11 items-center rounded bg-accent px-4 text-accent-foreground"
          >
            Browse all projects
          </Link>
        </div>
      </section>

      <section aria-label="Featured projects" className="flex flex-col gap-4">
        <SiteText id="home.featured" as="h2" fallback="Featured projects" className="text-2xl font-semibold" />
        {featured ? <Carousel projects={featured} /> : <p className="text-muted">Loading…</p>}
      </section>

      <section aria-label="Find a project" className="flex flex-col gap-4">
        <SiteText id="home.find" as="h2" fallback="Find a project" className="text-2xl font-semibold" />
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
