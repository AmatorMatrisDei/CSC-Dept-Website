import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { CheckField, Fieldset, Notice, TextArea, TextField, buttonClass, fieldClass, secondaryButtonClass } from "@/components/Form";
import { getMyRole } from "@/lib/account";
import { useSession } from "@/lib/auth";
import { useAsync, useTitle } from "@/lib/hooks";
import { deleteCourse, firstFall, loadCatalogs, loadPlannerData, saveCourse, yearLabel } from "@/lib/planner/data";
import type { Catalog, Course, PrerequisiteGroup, Term } from "@/lib/planner/types";

// The planner's course catalog, one catalog year at a time. Anyone can browse it; admins edit
// it, and whatever is saved here is what the planner shows for that year.

const TERMS = ["fall", "spring", "summer"] as const;
const blank: Course = {
  catalog_year: "", id: "", code: "", title: "", credits: 3, credits_max: null, prerequisite_groups: [], corequisites: [], offered: [],
  offered_years: {}, prerequisite_text: null, corequisite_text: null, offered_text: null, catalog_url: null, description: null,
};
const idFromCode = (code: string) => code.replace(/\s+/g, "").toUpperCase();

// The version only makes useAsync read the catalog again after a save.
function loadCatalog(year: string, version: number) {
  void version;
  return loadPlannerData(year);
}

export default function PlannerCourses() {
  useTitle("Course catalog");
  const session = useSession();
  const catalogs = useAsync(loadCatalogs);
  if (session === undefined || !catalogs) return <p className="text-muted">Loading…</p>;
  if (!catalogs.length) return <Notice>The planner has no catalogs yet.</Notice>;
  return session ? <SignedIn userId={session.user.id} catalogs={catalogs} /> : <CourseList isAdmin={false} catalogs={catalogs} />;
}

function SignedIn({ userId, catalogs }: { userId: string; catalogs: Catalog[] }) {
  const me = useAsync(getMyRole, userId);
  if (me === undefined) return <p className="text-muted">Loading…</p>;
  return <CourseList isAdmin={me?.role === "admin"} catalogs={catalogs} />;
}

// Anyone can browse the catalog; only admins get the add, edit and delete controls. The year is
// in the address (/planner/courses?year=2024-2025), so the planner can link to its own catalog.
function CourseList({ isAdmin, catalogs }: { isAdmin: boolean; catalogs: Catalog[] }) {
  const [params, setParams] = useSearchParams();
  const year = catalogs.find((c) => c.year === params.get("year"))?.year ?? catalogs[catalogs.length - 1].year;
  const [version, setVersion] = useState(0);
  const data = useAsync(loadCatalog, year, version);
  const [editing, setEditing] = useState<{ course: Course; isNew: boolean } | null>(null);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  // A link from the planner (/planner/courses#CSC120) scrolls to that course once the list is there.
  const loaded = !!data;
  useEffect(() => {
    if (loaded && window.location.hash) document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.scrollIntoView();
  }, [loaded]);

  const yearPicker = (
    <label className="flex max-w-md flex-col gap-1 font-medium">
      Catalog year
      <select
        value={year}
        disabled={!!editing}
        onChange={(e) => {
          setNote(null);
          setParams({ year: e.target.value }, { replace: true });
        }}
        className={fieldClass}
      >
        {[...catalogs].reverse().map((c) => (
          <option key={c.year} value={c.year}>
            {yearLabel(c.year)} (students who started in fall {firstFall(c.year)})
          </option>
        ))}
      </select>
    </label>
  );
  if (!data) return <div className="flex flex-col gap-6">{yearPicker}<p className="text-muted">Loading…</p></div>;
  const query = search.trim().toLowerCase();
  const list = [...data.courses.values()].filter((c) => !query || c.code.toLowerCase().includes(query) || c.title.toLowerCase().includes(query));

  async function save(course: Course, isNew: boolean) {
    if (isNew && data!.courses.has(course.id)) return setNote({ tone: "error", text: `${course.code} already exists. Edit it from the list.` });
    const error = await saveCourse({ ...course, catalog_year: year });
    if (error) return setNote({ tone: "error", text: error });
    setNote({ tone: "success", text: `Saved ${course.code} in the ${yearLabel(year)} catalog.` });
    setEditing(null);
    setVersion((v) => v + 1);
  }

  async function remove(course: Course) {
    const used = data!.degrees.filter(
      (d) =>
        d.semesters.some((s) => s.entries.some((e) => "course" in e && e.course === course.id)) ||
        d.requirements.some((r) => r.options?.some((o) => o.includes(course.id))),
    );
    const warning = used.length ? ` ${used.map((d) => d.name).join(", ")} still use${used.length === 1 ? "s" : ""} it.` : "";
    if (!window.confirm(`Delete ${course.code} from the ${yearLabel(year)} catalog?${warning}`)) return;
    const error = await deleteCourse(year, course.id);
    if (error) return setNote({ tone: "error", text: error });
    setNote({ tone: "success", text: `Deleted ${course.code}.` });
    setEditing(null);
    setVersion((v) => v + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Course catalog</h1>
        <p className="max-w-2xl text-muted">
          The courses the <Link to="/planner" className="underline">degree planner</Link> uses, with what each covers, what it needs
          first, and when it is offered. Each catalog year has its own list: courses and requirements change from year to year.
        </p>
        {isAdmin && (
          <p className="max-w-2xl text-sm text-muted">
            Admins: pick the catalog year, then use Add a course or Edit below. Changes apply to that year only. Tick Fall or Spring for courses taught in only one of them, and the planner will warn
            a student who places the course in the wrong semester. Write prerequisites as groups: “MTH 220; CSC 144 or CSC 171” means
            MTH 220, and one of CSC 144 or CSC 171. Keep the catalog's own wording too, for anything a course can't cover (junior
            standing, instructor permission). Corequisites are course codes separated by commas. Every change is recorded in the
            audit log.
          </p>
        )}
      </div>
      {yearPicker}
      {note && <Notice tone={note.tone}>{note.text}</Notice>}

      {editing ? (
        <CourseForm
          key={editing.course.id || "new"}
          initial={editing.course}
          isNew={editing.isNew}
          courses={data.courses}
          onSave={(c) => save(c, editing.isNew)}
          onDelete={editing.isNew ? undefined : () => remove(editing.course)}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex max-w-md flex-1 flex-col gap-1 font-medium">
            Search courses
            <input value={search} onChange={(e) => setSearch(e.target.value)} className={fieldClass} />
          </label>
          {isAdmin && (
            <button type="button" onClick={() => { setNote(null); setEditing({ course: blank, isNew: true }); }} className={buttonClass}>
              Add a course
            </button>
          )}
        </div>
      )}

      <p className="text-sm text-muted">
        {list.length} courses in the {yearLabel(year)} catalog
        {data.catalog.catalogUrl && (
          <>
            {" · "}
            <a href={data.catalog.catalogUrl} target="_blank" rel="noopener noreferrer" className="underline">
              {data.catalog.name}
            </a>
          </>
        )}
      </p>
      <ul className="flex flex-col gap-2">
        {list.map((c) => (
          <li key={c.id} id={c.id} className="flex scroll-mt-4 flex-col gap-1 rounded border border-border p-3">
            <div className="flex flex-wrap items-center gap-x-4">
              <span className="font-medium">{c.code}</span>
              <span className="min-w-0 flex-1 text-sm text-muted">
                {c.title} · {creditsOf(c)} cr{c.offered_text ? ` · ${c.offered_text}` : c.offered.length ? ` · ${c.offered.join(", ")} only` : ""}
              </span>
              {isAdmin && (
                <button type="button" onClick={() => { setNote(null); setEditing({ course: c, isNew: false }); window.scrollTo(0, 0); }} className="min-h-11 text-sm underline">
                  Edit<span className="sr-only"> {c.code}</span>
                </button>
              )}
            </div>
            {c.description && <p className="text-sm">{c.description}</p>}
            {(c.prerequisite_text || c.prerequisite_groups.length > 0) && (
              <p className="text-sm text-muted">Prerequisites: {c.prerequisite_text ?? groupsText(c.prerequisite_groups, data.courses)}</p>
            )}
            {(c.corequisite_text || c.corequisites.length > 0) && (
              <p className="text-sm text-muted">Corequisites: {c.corequisite_text ?? codesOf(c.corequisites, data.courses)}</p>
            )}
            {c.catalog_url && (
              <a href={c.catalog_url} target="_blank" rel="noopener noreferrer" className="w-fit text-sm underline">
                Catalog page<span className="sr-only"> for {c.code}</span>
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const parseCodes = (text: string, courses: Map<string, Course>) => {
  const ids = text.split(",").map((s) => idFromCode(s)).filter(Boolean);
  return { ids, unknown: ids.filter((id) => !courses.has(id)) };
};
const codesOf = (ids: string[], courses: Map<string, Course>) => ids.map((id) => courses.get(id)?.code ?? id).join(", ");
const creditsOf = (c: Course) => (c.credits_max ? `${c.credits}–${c.credits_max}` : String(c.credits));

// Prerequisite groups as admins type them: groups split by ";", alternatives by "or".
// "MTH 220; CSC 144 or CSC 171" is MTH 220, and one of CSC 144 or CSC 171.
const groupsText = (groups: PrerequisiteGroup[], courses: Map<string, Course>) =>
  groups.map((g) => g.courses.map((id) => courses.get(id)?.code ?? id).join(" or ")).join("; ");

// A group keeps its "other" and "concurrent" settings while its courses stay the same.
function parseGroups(text: string, courses: Map<string, Course>, previous: PrerequisiteGroup[]) {
  const key = (ids: string[]) => [...ids].sort().join(",");
  const kept = new Map(previous.map((g) => [key(g.courses), g]));
  const lists = text
    .split(";")
    .map((part) => part.split(/\s+or\s+|,/i).map((s) => idFromCode(s)).filter(Boolean))
    .filter((ids) => ids.length);
  const groups = lists.map((ids): PrerequisiteGroup => ({ ...kept.get(key(ids)), courses: [...new Set(ids)] }));
  return { groups, unknown: lists.flat().filter((id) => !courses.has(id)) };
}

function CourseForm({
  initial,
  isNew,
  courses,
  onSave,
  onDelete,
  onCancel,
}: {
  initial: Course;
  isNew: boolean;
  courses: Map<string, Course>;
  onSave: (course: Course) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
}) {
  const [code, setCode] = useState(initial.code);
  const [title, setTitle] = useState(initial.title);
  const [credits, setCredits] = useState(String(initial.credits));
  const [creditsMax, setCreditsMax] = useState(initial.credits_max ? String(initial.credits_max) : "");
  const [pre, setPre] = useState(groupsText(initial.prerequisite_groups, courses));
  const [preText, setPreText] = useState(initial.prerequisite_text ?? "");
  const [coText, setCoText] = useState(initial.corequisite_text ?? "");
  const [offeredText, setOfferedText] = useState(initial.offered_text ?? "");
  const [catalogUrl, setCatalogUrl] = useState(initial.catalog_url ?? "");
  const [co, setCo] = useState(codesOf(initial.corequisites, courses));
  const [offered, setOffered] = useState(initial.offered);
  const [about, setAbout] = useState(initial.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const id = isNew ? idFromCode(code) : initial.id;
    const n = Number(credits);
    const max = creditsMax.trim() ? Number(creditsMax) : null;
    const prerequisites = parseGroups(pre, courses, initial.prerequisite_groups);
    const corequisites = parseCodes(co, courses);
    const unknown = [...prerequisites.unknown, ...corequisites.unknown];
    if (!id || !title.trim()) return setError("Add a code and a title.");
    if (!Number.isInteger(n) || n < 0 || n > 12) return setError("Credits must be a whole number from 0 to 12.");
    if (max !== null && (!Number.isInteger(max) || max <= n || max > 12)) return setError("“Up to” credits must be more than the credits, and at most 12.");
    if (catalogUrl.trim() && !/^https:\/\/\S+$/.test(catalogUrl.trim())) return setError("The catalog page must be an https:// link.");
    if (unknown.length) return setError(`These courses are not in the catalog: ${unknown.join(", ")}. Add them first.`);
    setError(null);
    setBusy(true);
    const years = Object.fromEntries(offered.map((t) => [t, initial.offered_years[t as Term] ?? "every"]));
    await onSave({
      catalog_year: initial.catalog_year, id, code: code.trim().toUpperCase(), title: title.trim(), credits: n, credits_max: max,
      prerequisite_groups: prerequisites.groups, corequisites: corequisites.ids, offered, offered_years: years,
      prerequisite_text: preText.trim() || null, corequisite_text: coText.trim() || null,
      offered_text: offeredText.trim() || null, catalog_url: catalogUrl.trim() || null, description: about.trim() || null,
    });
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Fieldset legend={isNew ? "Add a course" : `Edit ${initial.code}`}>
        <TextField label="Course code" hint="For example CSC 120. It cannot be changed after the course is created." required value={code} onChange={setCode} disabled={!isNew} maxLength={20} />
        <TextField label="Title" required value={title} onChange={setTitle} maxLength={200} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Credits" required type="number" min={0} max={12} value={credits} onChange={setCredits} />
          <TextField label="Up to (variable credit)" hint="Only for courses like internships, 1–6 credits." type="number" min={1} max={12} value={creditsMax} onChange={setCreditsMax} />
        </div>
        <TextField
          label="Prerequisites"
          hint="Separate groups with “;” and alternatives with “or”. “MTH 220; CSC 144 or CSC 171” means MTH 220, and one of CSC 144 or CSC 171."
          value={pre}
          onChange={setPre}
        />
        <TextArea label="Prerequisites, as the catalog words them" hint="Shown to students. Include what no course covers, such as junior standing or instructor permission." value={preText} onChange={setPreText} maxLength={1000} rows={2} />
        <TextField label="Corequisites" hint="Course codes separated by commas: courses taken in the same semester or earlier." value={co} onChange={setCo} />
        <TextField label="Corequisites, as the catalog words them" value={coText} onChange={setCoText} maxLength={1000} />
        <TextArea label="About this course" hint="Optional. A few sentences on what the course covers. Students see it on the planner." value={about} onChange={setAbout} maxLength={1000} rows={4} />
        <fieldset className="flex flex-col">
          <legend className="font-medium">Only offered in</legend>
          <p className="text-sm text-muted">Leave all unticked if the course is taught in any term. Which years (odd or even) stays as the catalog import set it.</p>
          {TERMS.map((t) => (
            <CheckField
              key={t}
              label={t[0].toUpperCase() + t.slice(1)}
              checked={offered.includes(t)}
              onChange={(on) => setOffered(on ? [...offered, t] : offered.filter((x) => x !== t))}
            />
          ))}
        </fieldset>
        <TextField label="When it's offered, as the catalog words it" hint="For example “Odd falls, every spring”." value={offeredText} onChange={setOfferedText} maxLength={200} />
        <TextField label="Catalog page" type="url" pattern="https://.*" value={catalogUrl} onChange={setCatalogUrl} />
      </Fieldset>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={buttonClass}>
          {busy ? "Saving…" : "Save course"}
        </button>
        <button type="button" onClick={onCancel} className={secondaryButtonClass}>
          Cancel
        </button>
        {onDelete && (
          <button type="button" onClick={() => void onDelete()} className={`${secondaryButtonClass} sm:ml-auto`}>
            Delete course
          </button>
        )}
      </div>
    </form>
  );
}
