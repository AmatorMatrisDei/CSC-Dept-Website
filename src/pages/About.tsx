import { Link } from "react-router";
import SiteText from "@/components/SiteText";
import { getAllFaculty } from "@/lib/content";
import { useAsync, useTitle } from "@/lib/hooks";

// The department, in the catalog's own words (each part editable in Edit mode), with the faculty
// list read live from the database.
const CATALOG_URL =
  "https://franciscan.smartcatalogiq.com/en/2026-2027/academic-catalog-2026-2027/undergraduate-academic-programs/engineering";

export default function About() {
  useTitle("About");
  const faculty = useAsync(getAllFaculty);

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <section className="flex flex-col gap-4">
        <SiteText id="about.title" as="h1" fallback="About the department" className="text-3xl font-semibold" />
        <SiteText id="about.body" multiline fallback="The department's description will appear here." />
      </section>

      <section className="flex flex-col gap-3">
        <SiteText id="about.mission.title" as="h2" fallback="Mission" className="text-2xl font-semibold" />
        <SiteText id="about.mission" multiline fallback="The department's mission will appear here." />
      </section>

      <section className="flex flex-col gap-3">
        <SiteText id="about.objectives.title" as="h2" fallback="Program educational objectives" className="text-2xl font-semibold" />
        <SiteText id="about.objectives" multiline fallback="The programs' educational objectives will appear here." />
      </section>

      <section className="flex flex-col gap-3">
        <SiteText id="about.programs.title" as="h2" fallback="Degree programs" className="text-2xl font-semibold" />
        <SiteText id="about.programs" multiline fallback="The department's degree programs will appear here." />
      </section>

      <section aria-labelledby="about-faculty" className="flex flex-col gap-3">
        <h2 id="about-faculty" className="text-2xl font-semibold">
          Faculty
        </h2>
        {!faculty ? (
          <p className="text-muted">Loading…</p>
        ) : faculty.length === 0 ? (
          <p className="text-muted">No faculty listed yet.</p>
        ) : (
          <ul className="flex flex-col">
            {faculty.map((f) => (
              <li key={f.slug} className="flex flex-wrap items-baseline gap-x-2">
                <Link to={`/faculty/${f.slug}`} className="inline-flex min-h-11 items-center underline">
                  {f.name}
                </Link>
                {f.title && <span className="text-sm text-muted">{f.title}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-sm text-muted">
        From the{" "}
        <a href={CATALOG_URL} target="_blank" rel="noopener noreferrer" className="underline">
          Franciscan University Academic Catalog 2026–2027
        </a>
        , where each program's requirements are listed.
      </p>
    </div>
  );
}
