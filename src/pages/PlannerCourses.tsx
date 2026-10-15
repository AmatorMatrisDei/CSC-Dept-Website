import { useEffect, useState } from "react";
import { Link } from "react-router";
import { CheckField, Fieldset, Notice, TextArea, TextField, buttonClass, fieldClass, secondaryButtonClass } from "@/components/Form";
import { getMyRole } from "@/lib/account";
import { useSession } from "@/lib/auth";
import { useAsync, useTitle } from "@/lib/hooks";
import { deleteCourse, loadPlannerData, saveCourse } from "@/lib/planner/data";
import type { Course } from "@/lib/planner/types";

// Admin page: the planner's course catalog. Whatever is saved here is what the planner shows.

const TERMS = ["fall", "spring", "summer"] as const;
const blank: Course = { id: "", code: "", title: "", credits: 3, prerequisites: [], corequisites: [], offered: [], description: null };
const idFromCode = (code: string) => code.replace(/\s+/g, "").toUpperCase();

// The version only makes useAsync read the catalog again after a save.
function loadCatalog(version: number) {
  void version;
  return loadPlannerData();
}

export default function PlannerCourses() {
  useTitle("Course catalog");
  const session = useSession();
  if (session === undefined) return <p className="text-muted">Loading…</p>;
  return session ? <SignedIn userId={session.user.id} /> : <Catalog isAdmin={false} />;
}

function SignedIn({ userId }: { userId: string }) {
  const me = useAsync(getMyRole, userId);
  if (me === undefined) return <p className="text-muted">Loading…</p>;
  return <Catalog isAdmin={me?.role === "admin"} />;
}

// Anyone can browse the catalog; only admins get the add, edit and delete controls.
function Catalog({ isAdmin }: { isAdmin: boolean }) {
  const [version, setVersion] = useState(0);
  const data = useAsync(loadCatalog, version);
  const [editing, setEditing] = useState<{ course: Course; isNew: boolean } | null>(null);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  // A link from the planner (/planner/courses#CSC120) scrolls to that course once the list is there.
  const loaded = !!data;
  useEffect(() => {
    if (loaded && window.location.hash) document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.scrollIntoView();
  }, [loaded]);

  if (!data) return <p className="text-muted">Loading…</p>;
  const query = search.trim().toLowerCase();
  const list = [...data.courses.values()].filter((c) => !query || c.code.toLowerCase().includes(query) || c.title.toLowerCase().includes(query));

  async function save(course: Course, isNew: boolean) {
    if (isNew && data!.courses.has(course.id)) return setNote({ tone: "error", text: `${course.code} already exists. Edit it from the list.` });
    const error = await saveCourse(course);
    if (error) return setNote({ tone: "error", text: error });
    setNote({ tone: "success", text: `Saved ${course.code}.` });
    setEditing(null);
    setVersion((v) => v + 1);
  }

  async function remove(course: Course) {
    const used = [...data!.degrees].filter((d) => d.semesters.some((s) => s.entries.some((e) => "course" in e && e.course === course.id)));
    const warning = used.length ? ` It is still in the suggested plan for ${used.map((d) => d.name).join(", ")}.` : "";
    if (!window.confirm(`Delete ${course.code}?${warning}`)) return;
    const error = await deleteCourse(course.id);
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
          first, and when it is offered.
        </p>
        {isAdmin && (
          <p className="max-w-2xl text-sm text-muted">
            Admins: use Add a course or Edit below. Tick Fall or Spring for courses taught in only one of them, and the planner will warn
            a student who places the course in the wrong semester. Prerequisites and corequisites are course codes, such as CSC 120,
            separated by commas.
          </p>
        )}
      </div>
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

      <p className="text-sm text-muted">{list.length} courses</p>
      <ul className="flex flex-col gap-2">
        {list.map((c) => (
          <li key={c.id} id={c.id} className="flex scroll-mt-4 flex-col gap-1 rounded border border-border p-3">
            <div className="flex flex-wrap items-center gap-x-4">
              <span className="font-medium">{c.code}</span>
              <span className="min-w-0 flex-1 text-sm text-muted">
                {c.title} · {c.credits} cr{c.offered.length ? ` · ${c.offered.join(", ")} only` : ""}
              </span>
              {isAdmin && (
                <button type="button" onClick={() => { setNote(null); setEditing({ course: c, isNew: false }); window.scrollTo(0, 0); }} className="min-h-11 text-sm underline">
                  Edit<span className="sr-only"> {c.code}</span>
                </button>
              )}
            </div>
            {c.description && <p className="text-sm">{c.description}</p>}
            {c.prerequisites.length > 0 && <p className="text-sm text-muted">Prerequisites: {codesOf(c.prerequisites, data.courses)}</p>}
            {c.corequisites.length > 0 && <p className="text-sm text-muted">Corequisites: {codesOf(c.corequisites, data.courses)}</p>}
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
  const [pre, setPre] = useState(codesOf(initial.prerequisites, courses));
  const [co, setCo] = useState(codesOf(initial.corequisites, courses));
  const [offered, setOffered] = useState(initial.offered);
  const [about, setAbout] = useState(initial.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const id = isNew ? idFromCode(code) : initial.id;
    const n = Number(credits);
    const prerequisites = parseCodes(pre, courses);
    const corequisites = parseCodes(co, courses);
    const unknown = [...prerequisites.unknown, ...corequisites.unknown];
    if (!id || !title.trim()) return setError("Add a code and a title.");
    if (!Number.isInteger(n) || n < 0 || n > 12) return setError("Credits must be a whole number from 0 to 12.");
    if (unknown.length) return setError(`These courses are not in the catalog: ${unknown.join(", ")}. Add them first.`);
    setError(null);
    setBusy(true);
    await onSave({ id, code: code.trim().toUpperCase(), title: title.trim(), credits: n, prerequisites: prerequisites.ids, corequisites: corequisites.ids, offered, description: about.trim() || null });
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Fieldset legend={isNew ? "Add a course" : `Edit ${initial.code}`}>
        <TextField label="Course code" hint="For example CSC 120. It cannot be changed after the course is created." required value={code} onChange={setCode} disabled={!isNew} maxLength={20} />
        <TextField label="Title" required value={title} onChange={setTitle} maxLength={200} />
        <TextField label="Credits" required type="number" min={0} max={12} value={credits} onChange={setCredits} />
        <TextField label="Prerequisites" hint="Course codes separated by commas. Leave empty if none." value={pre} onChange={setPre} />
        <TextField label="Corequisites" hint="Courses taken in the same semester or earlier." value={co} onChange={setCo} />
        <TextArea label="About this course" hint="Optional. A few sentences on what the course covers. Students see it on the planner." value={about} onChange={setAbout} maxLength={1000} rows={4} />
        <fieldset className="flex flex-col">
          <legend className="font-medium">Only offered in</legend>
          <p className="text-sm text-muted">Leave all unticked if the course is taught in any term.</p>
          {TERMS.map((t) => (
            <CheckField
              key={t}
              label={t[0].toUpperCase() + t.slice(1)}
              checked={offered.includes(t)}
              onChange={(on) => setOffered(on ? [...offered, t] : offered.filter((x) => x !== t))}
            />
          ))}
        </fieldset>
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
