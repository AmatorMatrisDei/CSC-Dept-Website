import { useSearchParams } from "react-router";
import { useState } from "react";
import ProjectCard from "@/components/ProjectCard";
import RevealList from "@/components/RevealList";
import { projectYears } from "@/lib/format";
import { CATEGORY_LABELS, STATUSES, type Faculty, type ProjectView, type SubDepartment } from "@/lib/types";

type FilterName = "status" | "department" | "year" | "category" | "advisor";

type Props = {
  projects: ProjectView[];
  departments: SubDepartment[];
  advisors: Faculty[];
  // Home page: title, advisor, department. Projects page: everything.
  filters: FilterName[];
};

const fieldClass = "min-h-11 w-full rounded border border-border bg-background px-3";

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={fieldClass}>
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// The menus in the top bar link here with ?status=, ?department=, ?year=, ?category= or ?advisor=.
// The key remounts the browser when the URL changes, so those links always apply.
export default function ProjectBrowser(props: Props) {
  const [params] = useSearchParams();
  return <Browser key={params.toString()} {...props} initial={Object.fromEntries(params)} />;
}

function Browser({
  projects,
  departments,
  advisors,
  filters,
  initial,
}: Props & { initial: Record<string, string> }) {
  const [query, setQuery] = useState(initial.q ?? "");
  const [status, setStatus] = useState(initial.status ?? "");
  const [department, setDepartment] = useState(initial.department ?? "");
  const [year, setYear] = useState(initial.year ?? "");
  const [category, setCategory] = useState(initial.category ?? "");
  const [advisor, setAdvisor] = useState(initial.advisor ?? "");

  const visible = projects.filter((p) => {
    if (status && p.status !== status) return false;
    if (department && p.sub_department.slug !== department) return false;
    if (year && p.date_started?.slice(0, 4) !== year) return false;
    if (category && p.category !== category) return false;
    if (advisor && !p.advisors.some((a) => a.slug === advisor)) return false;
    const needle = query.trim().toLowerCase();
    return !needle || p.title.toLowerCase().includes(needle);
  });

  const has = (name: FilterName) => filters.includes(name);

  return (
    <div className="flex flex-col gap-6">
      <form
        id="search"
        role="search"
        aria-label="Filter projects"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(e) => e.preventDefault()}
      >
        <label className="flex flex-col gap-1 text-sm">
          Project title
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title"
            className={fieldClass}
          />
        </label>
        {has("category") && (
          <Select
            label="Category"
            value={category}
            onChange={setCategory}
            options={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))}
          />
        )}
        {has("status") && (
          <Select
            label="Status"
            value={status}
            onChange={setStatus}
            options={STATUSES.map((s) => ({ value: s, label: s }))}
          />
        )}
        {has("department") && (
          <Select
            label="Sub-department"
            value={department}
            onChange={setDepartment}
            options={departments.map((d) => ({ value: d.slug, label: d.name }))}
          />
        )}
        {has("year") && (
          <Select
            label="Year started"
            value={year}
            onChange={setYear}
            options={projectYears(projects).map((y) => ({ value: String(y), label: String(y) }))}
          />
        )}
        {has("advisor") && (
          <Select
            label="Faculty advisor"
            value={advisor}
            onChange={setAdvisor}
            options={advisors.map((a) => ({ value: a.slug, label: a.name }))}
          />
        )}
      </form>

      <p className="text-sm text-muted" role="status">
        Showing {visible.length} of {projects.length} projects
      </p>

      {visible.length === 0 ? (
        <p className="text-muted">No projects match those filters.</p>
      ) : (
        <RevealList className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((project) => (
            <li key={project.slug} className="flex">
              <ProjectCard project={project} />
            </li>
          ))}
        </RevealList>
      )}
    </div>
  );
}
