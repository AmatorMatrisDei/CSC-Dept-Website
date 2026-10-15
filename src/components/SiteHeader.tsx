import Link from "next/link";
import PaletteSwitcher from "@/components/PaletteSwitcher";
import SiteNav, { type NavMenu } from "@/components/SiteNav";
import { getAllFaculty, getProjects, getStudents, getSubDepartments } from "@/lib/content";
import { projectYears } from "@/lib/format";
import { CATEGORY_LABELS, STATUSES } from "@/lib/types";

// Builds the top bar menus (FR-4.2, FR-4.4, FR-4.6) so every page is within 3 clicks of Home.
export default async function SiteHeader() {
  const [projects, departments, faculty, students] = await Promise.all([
    getProjects(),
    getSubDepartments(),
    getAllFaculty(),
    getStudents(),
  ]);

  const menus: NavMenu[] = [
    {
      label: "Projects",
      href: "/projects",
      groups: [
        {
          heading: "Status",
          links: STATUSES.map((s) => ({ label: s, href: `/projects?status=${s}` })),
        },
        {
          heading: "Sub-department",
          links: departments.map((d) => ({ label: d.name, href: `/projects?department=${d.slug}` })),
        },
        {
          heading: "Year",
          links: projectYears(projects).map((y) => ({ label: String(y), href: `/projects?year=${y}` })),
        },
        {
          heading: "Showcase",
          links: Object.entries(CATEGORY_LABELS).map(([slug, label]) => ({
            label,
            href: `/projects?category=${slug}`,
          })),
        },
        { links: [{ label: "Search by title", href: "/projects#search" }] },
      ],
    },
    {
      label: "Faculty",
      href: "/faculty",
      groups: [{ links: faculty.map((f) => ({ label: f.name, href: `/faculty/${f.slug}` })) }],
    },
    {
      label: "Students",
      href: "/students",
      groups: [
        { links: [{ label: "Search by skill", href: "/students#search" }] },
        {
          heading: "Class year",
          links: [...new Set(students.map((s) => s.class_year))]
            .sort((a, b) => a - b)
            .map((y) => ({ label: String(y), href: `/students?year=${y}` })),
        },
        { links: [{ label: "Request to be added", href: "/students/request" }] },
      ],
    },
  ];

  return (
    <header className="relative border-b-4 border-highlight bg-header text-header-foreground">
      <div className="border-b border-border bg-surface text-foreground">
        <div className="mx-auto flex max-w-6xl justify-end px-4">
          <PaletteSwitcher />
        </div>
      </div>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-30 focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-foreground"
      >
        Skip to content
      </a>
      <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-2 md:flex-row md:items-center md:justify-between">
        <Link href="/" className="inline-flex min-h-11 items-center text-lg font-semibold">
          Engineering &amp; Computing
        </Link>
        <SiteNav menus={menus} />
      </div>
    </header>
  );
}
