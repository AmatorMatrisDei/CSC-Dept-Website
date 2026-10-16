import { useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { Notice, buttonClass, fieldClass, secondaryButtonClass } from "@/components/Form";
import { getMyRole } from "@/lib/account";
import { useSession } from "@/lib/auth";
import { useAsync, useTitle } from "@/lib/hooks";
import { firstFall, forgetPlannerData, loadCatalogs, loadPlannerData, saveSuggestedPlan, yearLabel } from "@/lib/planner/data";
import { downloadCsv, downloadExcel } from "@/lib/planner/export";
import {
  MAX_CREDITS,
  addCourse,
  checkRequirements,
  itemCredits,
  moveItem,
  removeItem,
  semesterCredits,
  semesterLabel,
  suggestedPlan,
  warnings,
  type RequirementStatus,
  type Start,
} from "@/lib/planner/plan";
import { emptyState, getPlannerState, planKey, savePlannerState, type PlannerState } from "@/lib/planner/store";
import type { Catalog, Course, Degree, Plan, PlannerData, SuggestedSemester } from "@/lib/planner/types";

// Experimental degree planner. Courses and requirements follow the catalog of the academic year
// a student started in (a spring 2025 start follows the 2024-2025 catalog). Anyone can preview each program's suggested plan; signed-in people build their own,
// saved to their account. Admins can also edit the suggested plans here and the courses on the
// course catalog page.

type Mode = "suggested" | "mine" | "admin";

function toSemesters(plan: Plan, degree: Degree): SuggestedSemester[] {
  return plan.map((items, s) => ({
    ...degree.semesters[s],
    entries: items.map((i) => (i.course ? { course: i.course } : { slot: i.slot ?? "Elective", credits: i.credits })),
  }));
}

export default function Planner() {
  useTitle("Degree planner");
  const catalogs = useAsync(loadCatalogs);
  const session = useSession();
  if (!catalogs || session === undefined) return <p className="text-muted">Loading…</p>;
  if (!catalogs.length) return <Notice>The planner has no catalogs yet.</Notice>;
  return session ? (
    <AccountPlanner catalogs={catalogs} userId={session.user.id} />
  ) : (
    <Workspace catalogs={catalogs} userId={null} initial={emptyState()} isAdmin={false} />
  );
}

function AccountPlanner({ catalogs, userId }: { catalogs: Catalog[]; userId: string }) {
  const initial = useAsync(getPlannerState, userId);
  const me = useAsync(getMyRole, userId);
  if (!initial || me === undefined) return <p className="text-muted">Loading…</p>;
  return <Workspace catalogs={catalogs} userId={userId} initial={initial} isAdmin={me?.role === "admin"} />;
}

function Workspace({ catalogs, userId, initial, isAdmin }: { catalogs: Catalog[]; userId: string | null; initial: PlannerState; isAdmin: boolean }) {
  const [state, setState] = useState(initial);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [adminEditing, setAdminEditing] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  // Visitors, and people who haven't picked a year yet, see the newest catalog.
  const year = catalogs.find((c) => c.year === state.catalog)?.year ?? catalogs[catalogs.length - 1].year;
  const data = useAsync(loadPlannerData, year);

  // Changes are saved to the account a moment after the last one.
  function update(next: PlannerState) {
    setState(next);
    if (!userId) return;
    setSaveNote("Saving…");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const error = await savePlannerState(userId, next);
      setSaveNote(error ? `Could not save: ${error}` : "Saved to your account.");
    }, 700);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="w-fit rounded border border-border px-3 py-1 text-sm">Experimental</p>
        <h1 className="text-3xl font-semibold">Degree planner</h1>
        <p className="max-w-2xl text-muted">
          Plan your years in the department. Nothing here is an official record, so check your plan with an advisor.
        </p>
      </div>

      {!userId && (
        <Notice>
          You are viewing the suggested plans.{" "}
          <Link to="/account/sign-in?next=/planner" className="underline">
            Sign in
          </Link>{" "}
          to build your own plan and save it to your account.
        </Notice>
      )}
      {userId && !state.catalog && (
        <Notice>Pick the semester you started at Franciscan, so the planner uses the courses and requirements of your catalog.</Notice>
      )}

      <UserGuide signedIn={!!userId} />
      {isAdmin && <AdminGuide />}

      <div className="grid gap-4 md:grid-cols-3">
        <label className="flex flex-col gap-1 font-medium">
          Semester you started
          <select
            value={`${year}|${state.start}`}
            disabled={adminEditing}
            onChange={(e) => {
              const [catalog, start] = e.target.value.split("|");
              update({ ...state, catalog, start: start === "spring" ? "spring" : "fall" });
            }}
            className={fieldClass}
            aria-describedby="catalog-hint"
          >
            {[...catalogs].reverse().flatMap((c) => [
              <option key={`${c.year}|spring`} value={`${c.year}|spring`}>
                Spring {firstFall(c.year) + 1} ({yearLabel(c.year)} catalog)
              </option>,
              <option key={`${c.year}|fall`} value={`${c.year}|fall`}>
                Fall {firstFall(c.year)} ({yearLabel(c.year)} catalog)
              </option>,
            ])}
          </select>
          <span id="catalog-hint" className="text-sm font-normal text-muted">
            Your courses and requirements come from the catalog of the academic year you started in. A spring start uses the
            catalog from the fall before it.
          </span>
        </label>
        {data ? (
          <ProgramPickers data={data} state={state} disabled={adminEditing} onState={update} />
        ) : (
          <p className="text-muted md:col-span-2">Loading the {yearLabel(year)} catalog…</p>
        )}
      </div>

      {userId && (
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Plan view" className="flex gap-2">
            {(["suggested", "mine"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={!adminEditing && state.mode === m}
                disabled={adminEditing}
                onClick={() => update({ ...state, mode: m })}
                className={`min-h-11 rounded border px-4 py-2 font-medium disabled:opacity-60 ${!adminEditing && state.mode === m ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface hover:border-highlight"}`}
              >
                {m === "suggested" ? "Suggested plan" : "My plan"}
              </button>
            ))}
          </div>
          {saveNote && (
            <p role="status" className="text-sm text-muted">
              {saveNote}
            </p>
          )}
        </div>
      )}

      {data && (
        <ProgramView
          data={data}
          state={state}
          mode={!userId ? "suggested" : adminEditing ? "admin" : state.mode}
          onState={update}
          isAdmin={isAdmin}
          onAdminEdit={setAdminEditing}
        />
      )}
    </div>
  );
}

const programs = (data: PlannerData) => data.degrees.filter((d) => d.kind !== "minor");
const minors = (data: PlannerData) => data.degrees.filter((d) => d.kind === "minor");

// The program a student picked, if this catalog has it, else Computer Science or the first one.
function chosen(data: PlannerData, state: PlannerState) {
  const list = programs(data);
  const degree = list.find((d) => d.id === state.degree) ?? list.find((d) => d.id === "BS_CS") ?? list[0];
  const minor = minors(data).find((d) => d.id === state.minor) ?? null;
  return { degree, minor };
}

function ProgramPickers({ data, state, disabled, onState }: { data: PlannerData; state: PlannerState; disabled: boolean; onState: (next: PlannerState) => void }) {
  const { degree, minor } = chosen(data, state);
  const list = programs(data);
  const groups = [
    { label: "Majors", items: list.filter((d) => d.kind === "major") },
    { label: "Pre-engineering (transfer programs)", items: list.filter((d) => d.kind === "pre_engineering") },
  ];
  return (
    <>
      <label className="flex flex-col gap-1 font-medium">
        Program
        <select value={degree?.id ?? ""} disabled={disabled} onChange={(e) => onState({ ...state, degree: e.target.value })} className={fieldClass}>
          {groups.map((g) =>
            g.items.length ? (
              <optgroup key={g.label} label={g.label}>
                {g.items.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </optgroup>
            ) : null,
          )}
        </select>
      </label>
      <label className="flex flex-col gap-1 font-medium">
        Minor (optional)
        <select value={minor?.id ?? ""} disabled={disabled} onChange={(e) => onState({ ...state, minor: e.target.value || null })} className={fieldClass}>
          <option value="">None</option>
          {minors(data).map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

function ProgramView({
  data,
  state,
  mode,
  onState,
  isAdmin,
  onAdminEdit,
}: {
  data: PlannerData;
  state: PlannerState;
  mode: Mode;
  onState: (next: PlannerState) => void;
  isAdmin: boolean;
  onAdminEdit: (editing: boolean) => void;
}) {
  const [edits, setEdits] = useState<Record<string, SuggestedSemester[]>>({});
  const { degree: base, minor } = chosen(data, state);
  if (!base) return <Notice>The {yearLabel(data.catalog.year)} catalog has no programs in the planner yet.</Notice>;
  const key = planKey(data.catalog.year, base.id);
  const degree: Degree = edits[key] ? { ...base, semesters: edits[key] } : base;
  return (
    <PlanView
      key={`${data.catalog.year}-${degree.id}-${mode}-${state.start}`}
      data={data}
      degree={degree}
      minor={minor}
      mode={mode}
      state={state}
      onState={onState}
      isAdmin={isAdmin}
      onAdminEdit={onAdminEdit}
      onSaved={(semesters) => setEdits((e) => ({ ...e, [key]: semesters }))}
    />
  );
}

function UserGuide({ signedIn }: { signedIn: boolean }) {
  return (
    <details className="rounded-lg border border-border bg-surface p-4">
      <summary className="min-h-11 cursor-pointer py-2 font-medium">How to use the planner</summary>
      <ul className="list-disc pl-5 pt-2 text-sm">
        <li>
          Pick the semester you started. Courses, credits and requirements change from one catalog to the next, and yours are the
          ones in the catalog of the academic year you started in: spring 2025 counts as the 2024–2025 catalog, like fall 2024.
        </li>
        <li>
          Pick your program. The suggested plan is the catalog's recommended order of courses: eight semesters for a major, or the
          semesters at Franciscan for a pre-engineering transfer program. Add a minor to see what it requires too.
        </li>
        <li>Open "About this course" under a course to read its prerequisites and when it is offered.</li>
        {signedIn ? (
          <>
            <li>
              Switch to <strong>My plan</strong> to make it your own. Drag a course card onto another semester, or use its "Move to" menu,
              which also works with a keyboard or on a phone. Use "Remove" to take a course out.
            </li>
            <li>Search by course code or title under "Add a course" to put more courses in your plan.</li>
            <li>
              Tick <strong>Completed</strong> on courses you have finished. They count as done when the planner checks prerequisites
              and requirements.
            </li>
            <li>
              Warnings appear when a course needs a prerequisite you have not planned earlier, or is only offered in a different
              semester or year. A semester over {MAX_CREDITS} credits is marked too. They are guidance, not rules, so check with your
              advisor.
            </li>
            <li>
              "Requirements" lists what your program and minor require, and which of those your plan covers. Electives and core
              areas are yours to choose, so the planner doesn't check them.
            </li>
            <li>Your plan saves to your account as you go. "Reset to suggested" starts over. Download Excel or CSV for a copy.</li>
          </>
        ) : (
          <li>
            <Link to="/account/sign-in?next=/planner" className="underline">
              Sign in
            </Link>{" "}
            to build your own plan: drag courses between semesters, add courses, mark what you have completed, and get warnings about
            prerequisites and requirements. It saves to your account.
          </li>
        )}
      </ul>
    </details>
  );
}

function AdminGuide() {
  return (
    <details className="rounded-lg border border-border bg-surface p-4">
      <summary className="min-h-11 cursor-pointer py-2 font-medium">Admin guide: managing the planner</summary>
      <div className="flex flex-col gap-3 pt-2 text-sm">
        <p>
          The planner reads everything from the database, so changes here show up for everyone as soon as you save. Each catalog
          year has its own courses and plans: pick the year first, and a change applies to that year only.
        </p>
        <ul className="list-disc pl-5">
          <li>
            <strong>Courses:</strong> open the{" "}
            <Link to="/planner/courses" className="underline">
              course catalog
            </Link>
            , pick the year, then add a course, change its title or credits, list its prerequisites and corequisites, or delete it.
          </li>
          <li>
            <strong>Offered terms:</strong> tick Fall and/or Spring on a course if it is only taught then. A student who places it in
            another semester sees a warning. Leave all unticked if it is taught any term.
          </li>
          <li>
            <strong>Suggested plans:</strong> pick a year and a program, press "Edit suggested plan", move or add courses like a
            student does, then press Save. The warnings show while you edit, so you can check the sequence.
          </li>
          <li>
            <strong>Prerequisites</strong> are written as course codes, such as CSC 120. A course still used by other courses or by a
            program can't be deleted, so take it out of those first.
          </li>
        </ul>
      </div>
    </details>
  );
}

function PlanView({
  data,
  degree,
  minor,
  mode,
  state,
  onState,
  isAdmin,
  onAdminEdit,
  onSaved,
}: {
  data: PlannerData;
  degree: Degree;
  minor: Degree | null;
  mode: Mode;
  state: PlannerState;
  onState: (next: PlannerState) => void;
  isAdmin: boolean;
  onAdminEdit: (editing: boolean) => void;
  onSaved: (semesters: SuggestedSemester[]) => void;
}) {
  const { courses, catalog } = data;
  const fall = firstFall(catalog.year);
  // Admins edit the catalog's own plan, which always begins in a fall.
  const spring = state.start === "spring" && mode !== "admin";
  const start: Start = useMemo(() => ({ firstFall: fall, spring }), [fall, spring]);
  const offset = spring ? 1 : 0;
  const key = planKey(catalog.year, degree.id, spring);
  const suggested = useMemo(() => suggestedPlan(degree, start), [degree, start]);
  const stored = state.plans[key];
  const mine = stored && stored.length === suggested.length ? stored : suggested;
  const [draft, setDraft] = useState<Plan>(suggested);
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setOver] = useState<number | null>(null);

  const completed = useMemo(() => new Set(state.completed), [state.completed]);
  const plan = mode === "mine" ? mine : mode === "admin" ? draft : suggested;
  const editing = mode !== "suggested";
  const problems = useMemo(
    () => (editing ? warnings(plan, courses, mode === "admin" ? new Set() : completed, start) : []),
    [editing, plan, courses, completed, mode, start],
  );
  const total = plan.reduce((sum, items) => sum + semesterCredits(items, courses), 0);
  const placed = new Set(plan.flat().flatMap((i) => (i.course ? [i.course] : [])));

  function change(next: Plan) {
    if (mode === "admin") setDraft(next);
    else onState({ ...state, plans: { ...state.plans, [key]: next } });
  }

  function toggle(id: string) {
    const next = new Set(completed);
    if (!next.delete(id)) next.add(id);
    onState({ ...state, completed: [...next] });
  }

  function addAll(ids: string[]) {
    change(ids.reduce((p, id) => addCourse(p, id, target), plan));
  }

  async function saveSuggested() {
    setBusy(true);
    const semesters = toSemesters(draft, degree);
    const error = await saveSuggestedPlan(catalog.year, degree.id, semesters);
    setBusy(false);
    if (error) return setNote(error);
    forgetPlannerData(catalog.year);
    onSaved(semesters);
    onAdminEdit(false);
  }

  const query = search.trim().toLowerCase();
  const matches = query
    ? [...courses.values()]
        .filter((c) => !placed.has(c.id) && (c.code.toLowerCase().includes(query) || c.title.toLowerCase().includes(query)))
        .sort((a, b) => Number(!a.code.toLowerCase().startsWith(query)) - Number(!b.code.toLowerCase().startsWith(query)) || a.code.localeCompare(b.code))
        .slice(0, 8)
    : [];

  const fileName = `${degree.id}-${catalog.year}${spring ? "-spring-start" : ""}-${mode === "mine" ? "my-plan" : "suggested-plan"}`;
  const title = `${degree.name} plan (${yearLabel(catalog.year)} catalog)`;
  const checked = mode === "mine" ? { planned: placed, completed } : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold">{degree.name}</h2>
        <p className="text-muted">
          {degree.degree} · {yearLabel(catalog.year)} catalog
          {degree.catalogUrl && (
            <>
              {" · "}
              <a href={degree.catalogUrl} target="_blank" rel="noopener noreferrer" className="underline">
                Catalog page
              </a>
            </>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void downloadExcel(plan, courses, completed, fileName, title, start)} className={secondaryButtonClass}>
          Download Excel (.xlsx)
        </button>
        <button type="button" onClick={() => downloadCsv(plan, courses, completed, fileName, start)} className={secondaryButtonClass}>
          Download CSV
        </button>
        {isAdmin && mode !== "admin" && (
          <button type="button" onClick={() => { setDraft(suggested); onAdminEdit(true); }} className={`${secondaryButtonClass} sm:ml-auto`}>
            Edit suggested plan
          </button>
        )}
        {mode === "admin" && (
          <span className="flex gap-2 sm:ml-auto">
            <button type="button" disabled={busy} onClick={() => void saveSuggested()} className={buttonClass}>
              {busy ? "Saving…" : "Save suggested plan"}
            </button>
            <button type="button" disabled={busy} onClick={() => onAdminEdit(false)} className={secondaryButtonClass}>
              Cancel
            </button>
          </span>
        )}
      </div>
      {note && <Notice tone="error">{note}</Notice>}

      <p className="text-sm text-muted">
        {mode === "mine"
          ? "Drag courses between semesters (or use Move to), remove them, or add more. Changes save to your account."
          : mode === "admin"
            ? `Editing the ${yearLabel(catalog.year)} suggested plan for ${degree.name}. It changes for everyone using that catalog when you press Save.`
            : `The catalog's recommended sequence for ${degree.name}. Your actual schedule may vary.`}{" "}
        {total} credits planned of {degree.totalCredits} in the plan.
      </p>
      {spring && (
        <p className="rounded-lg border border-border bg-surface p-3 text-sm">
          You started in spring {fall + 1}. The catalog's plan begins in a fall, so here it starts in fall {fall + 1}, and spring{" "}
          {fall + 1} is open for core courses or anything you can take first. Your advisor can help you move courses earlier.
        </p>
      )}
      {degree.kind === "pre_engineering" && (
        <p className="rounded-lg border border-border bg-surface p-3 text-sm">
          This is a transfer program: the plan covers your semesters at Franciscan ({degree.degree.toLowerCase()}). The transfer
          requirements are under "Requirements and catalog notes".
        </p>
      )}
      {degree.autoGenerated && (
        <p className="rounded-lg border border-border bg-surface p-3 text-sm">
          This plan was generated from course prerequisites. Check it with your academic advisor.
        </p>
      )}

      <RequirementsPanel degree={degree} courses={courses} checked={checked} onAdd={editing ? addAll : undefined} />
      {minor && <RequirementsPanel degree={minor} courses={courses} checked={checked} onAdd={editing ? addAll : undefined} open />}

      {editing && (
        <section aria-labelledby="add-heading" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <h2 id="add-heading" className="text-lg font-semibold">
            Add a course
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Search by code or title
              <input value={search} onChange={(e) => setSearch(e.target.value)} className={fieldClass} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Add to
              <select value={target} onChange={(e) => setTarget(Number(e.target.value))} className={fieldClass}>
                {plan.map((_, s) => (
                  <option key={s} value={s}>
                    {semesterLabel(s, start)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {query && matches.length === 0 && <p className="text-sm text-muted">No matching courses left to add.</p>}
          <ul className="flex flex-col gap-2">
            {matches.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3">
                <span className="font-medium">{c.code}</span>
                <span className="text-sm text-muted">
                  {c.title} · {c.credits_max ? `${c.credits}–${c.credits_max}` : c.credits} cr
                </span>
                <button type="button" onClick={() => change(addCourse(plan, c.id, target))} className="min-h-11 text-sm underline">
                  Add<span className="sr-only"> {c.code}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {editing && problems.length > 0 && (
        <section aria-labelledby="warn-heading" className="rounded-lg border border-border bg-surface p-4">
          <h2 id="warn-heading" className="text-lg font-semibold">
            {problems.length} thing{problems.length === 1 ? "" : "s"} to check
          </h2>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {problems.map((p, i) => (
              <li key={i}>
                <strong>{courses.get(p.courseId)?.code}</strong>: {p.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-col gap-6">
        {Array.from({ length: Math.floor((plan.length - 1 + offset) / 2) + 1 }, (_, year) => (
          <section key={year} aria-labelledby={`year-${year}`} className="flex flex-col gap-2">
            <h2 id={`year-${year}`} className="text-lg font-semibold">
              Year {year + 1}{" "}
              <span className="font-normal text-muted">
                ({fall + year}–{String(fall + year + 1).slice(2)})
              </span>
            </h2>
            <ol className="grid gap-3 md:grid-cols-2">
              {[year * 2 - offset, year * 2 + 1 - offset].filter((s) => s >= 0 && s < plan.length).map((s) => {
                const items = plan[s];
                const credits = semesterCredits(items, courses);
                const tooMany = credits > MAX_CREDITS;
                return (
                  <li
                    key={s}
                    onDragOver={editing && dragging ? (e) => { e.preventDefault(); setOver(s); } : undefined}
                    onDragLeave={editing ? () => setOver((o) => (o === s ? null : o)) : undefined}
                    onDrop={
                      editing
                        ? (e) => {
                            e.preventDefault();
                            if (dragging) change(moveItem(plan, dragging, s));
                            setDragging(null);
                            setOver(null);
                          }
                        : undefined
                    }
                    className={`flex flex-col gap-2 rounded-lg border p-3 ${dropTarget === s ? "border-accent bg-surface" : "border-border"}`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-semibold">{semesterLabel(s, start).split(", ")[1]}</h3>
                      <span className={`text-sm ${tooMany ? "font-semibold" : "text-muted"}`}>
                        {credits} cr{tooMany ? ` (over ${MAX_CREDITS})` : ""}
                      </span>
                    </div>
                    {!editing && degree.semesters[s - offset]?.note && <p className="text-sm text-muted">{degree.semesters[s - offset].note}</p>}
                    {spring && s === 0 && items.length === 0 ? (
                      <p className="text-sm text-muted">Your first semester. The catalog's plan starts next fall, so this one is yours to fill.</p>
                    ) : (
                      items.length === 0 && <p className="text-sm text-muted">Nothing planned.</p>
                    )}
                    <ul className="flex flex-col gap-1.5">
                      {items.map((item) => {
                        const course = item.course ? courses.get(item.course) : undefined;
                        const itemProblems = problems.filter((p) => p.courseId === item.course);
                        const name = course?.code ?? item.slot ?? item.course;
                        return (
                          <li
                            key={item.key}
                            draggable={editing}
                            onDragStart={editing ? (e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", item.key); setDragging(item.key); } : undefined}
                            onDragEnd={editing ? () => { setDragging(null); setOver(null); } : undefined}
                            className={`flex flex-col rounded border px-2.5 py-1.5 ${item.course ? "border-border" : "border-dashed border-border bg-surface"} ${editing ? "cursor-grab active:cursor-grabbing" : ""} ${dragging === item.key ? "opacity-50" : ""}`}
                          >
                            <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                              <span className="font-medium">{name}</span>
                              {course && <span className="min-w-0 flex-1 text-muted">{course.title}</span>}
                              <span className="ml-auto text-muted">{itemCredits(item, courses)} cr</span>
                            </p>
                            {itemProblems.map((p, i) => (
                              <p key={i} className="text-sm font-medium">
                                ⚠ {p.message}
                              </p>
                            ))}
                            {course && <AboutCourse course={course} />}
                            <div className="flex flex-wrap items-center gap-x-3 text-sm">
                              {course && mode === "mine" && (
                                <label className="flex min-h-11 cursor-pointer items-center gap-2 md:min-h-8">
                                  <input type="checkbox" checked={completed.has(course.id)} onChange={() => toggle(course.id)} className="size-5 accent-[var(--accent)]" />
                                  Completed<span className="sr-only"> {course.code}</span>
                                </label>
                              )}
                              {editing && (
                                <>
                                  <select
                                    value={s}
                                    onChange={(e) => change(moveItem(plan, item.key, Number(e.target.value)))}
                                    aria-label={`Move ${name} to a semester`}
                                    className="min-h-11 rounded border border-border bg-background px-2 md:min-h-8"
                                  >
                                    {plan.map((_, n) => (
                                      <option key={n} value={n}>
                                        {semesterLabel(n, start)}
                                      </option>
                                    ))}
                                  </select>
                                  <button type="button" onClick={() => change(removeItem(plan, item.key))} className="min-h-11 underline md:min-h-8">
                                    Remove<span className="sr-only"> {name}</span>
                                  </button>
                                </>
                              )}
                              {course && (
                                <Link
                                  to={`/planner/courses?year=${catalog.year}#${course.id}`}
                                  title="See this course in the course catalog"
                                  aria-label={`See ${course.code} in the course catalog`}
                                  className="ml-auto flex min-h-11 min-w-11 items-center justify-end text-muted hover:text-foreground md:min-h-8"
                                >
                                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                                    <circle cx="12" cy="12" r="10" />
                                    <path d="M12 11v6" />
                                    <circle cx="12" cy="7.5" r="0.6" fill="currentColor" />
                                  </svg>
                                </Link>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>

      {mode === "mine" && (
        <p>
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Replace your plan with the suggested one? Courses you marked completed stay marked.")) {
                const rest = { ...state.plans };
                delete rest[key];
                onState({ ...state, plans: rest });
              }
            }}
            className={secondaryButtonClass}
          >
            Reset to suggested
          </button>
        </p>
      )}
    </div>
  );
}

function AboutCourse({ course }: { course: Course }) {
  if (!(course.description || course.prerequisite_text || course.corequisite_text || course.offered_text || course.catalog_url)) return null;
  return (
    <details className="text-sm">
      <summary className="flex min-h-11 cursor-pointer items-center underline md:min-h-7">
        About this course<span className="sr-only"> {course.code}</span>
      </summary>
      {course.description && <p className="pb-1 text-muted">{course.description}</p>}
      {course.prerequisite_text && <p className="pb-1 text-muted">Prerequisites: {course.prerequisite_text}</p>}
      {course.corequisite_text && <p className="pb-1 text-muted">Corequisites: {course.corequisite_text}</p>}
      {course.offered_text && <p className="pb-1 text-muted">Offered: {course.offered_text}</p>}
      {course.catalog_url && (
        <a href={course.catalog_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline md:min-h-7">
          Catalog page<span className="sr-only"> for {course.code}</span>
        </a>
      )}
    </details>
  );
}

const STATUS_TEXT: Record<RequirementStatus["status"], string> = {
  completed: "Completed",
  planned: "In your plan",
  missing: "Not in your plan",
  open: "Your choice",
};

// What a program requires, from the catalog. In "My plan" each line shows whether the plan (or the
// courses marked completed) covers it, with buttons to add a missing course.
function RequirementsPanel({
  degree,
  courses,
  checked,
  onAdd,
  open = false,
}: {
  degree: Degree;
  courses: Map<string, Course>;
  checked: { planned: Set<string>; completed: Set<string> } | null;
  onAdd?: (ids: string[]) => void;
  open?: boolean;
}) {
  const statuses = checkRequirements(degree.requirements, checked?.planned ?? new Set(), checked?.completed ?? new Set());
  const checkable = statuses.filter((s) => s.status !== "open");
  const met = checkable.filter((s) => s.status !== "missing").length;
  const code = (id: string) => courses.get(id)?.code ?? id;
  const optionText = (option: string[]) => option.map(code).join(" and ");
  const headingId = `req-${degree.id}`;
  return (
    <details open={open} className="rounded-lg border border-border bg-surface p-4">
      <summary className="min-h-11 cursor-pointer py-2 font-medium" id={headingId}>
        {degree.kind === "minor" ? degree.name : "Requirements and catalog notes"}
        {checked && checkable.length > 0 && (
          <span className="font-normal text-muted">
            {" "}
            · {met} of {checkable.length} course requirements met
          </span>
        )}
      </summary>
      <div className="flex flex-col gap-4 pt-2">
        {degree.requirements.length > 0 ? (
          <ul aria-labelledby={headingId} className="flex flex-col divide-y divide-border text-sm">
            {statuses.map(({ requirement, status, courses: used }, i) => {
              const options = requirement.options ?? [];
              const text = requirement.label
                ? `${requirement.label}${options.length ? `: ${options.map(optionText).join(", ")}` : ""}`
                : options.map(optionText).join(", or ");
              const title = options.length === 1 && options[0].length === 1 ? courses.get(options[0][0])?.title : undefined;
              return (
                <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{text}</span>
                    {title && <span className="text-muted"> · {title}</span>}
                    {requirement.credits ? <span className="text-muted"> · {requirement.credits} cr</span> : null}
                    {used.length > 0 && options.length > 1 && <span className="text-muted"> · using {optionText(used)}</span>}
                  </span>
                  {checked && (
                    <span className={status === "missing" ? "font-semibold" : "text-muted"}>
                      {status === "completed" || status === "planned" ? "✓ " : ""}
                      {STATUS_TEXT[status]}
                    </span>
                  )}
                  {checked && status === "missing" && onAdd && (
                    <span className="flex flex-wrap gap-x-3">
                      {options.slice(0, 4).map((o) => (
                        <button key={o.join()} type="button" onClick={() => onAdd(o)} className="min-h-11 underline md:min-h-8">
                          Add {optionText(o)}
                        </button>
                      ))}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">See the catalog page for what this program requires.</p>
        )}
        {checked && onAdd && statuses.some((s) => s.status === "missing") && (
          <p className="text-sm text-muted">"Add" puts a course in the semester chosen under "Add a course".</p>
        )}
        {degree.notes.length > 0 && (
          <div className="flex flex-col gap-1 text-sm">
            <h3 className="font-semibold">From the catalog</h3>
            {degree.notes.map((n, i) => (
              <p key={i} className="text-muted">
                {n}
              </p>
            ))}
          </div>
        )}
        {degree.kind === "minor" && degree.catalogUrl && (
          <a href={degree.catalogUrl} target="_blank" rel="noopener noreferrer" className="w-fit text-sm underline">
            Catalog page<span className="sr-only"> for the {degree.name}</span>
          </a>
        )}
      </div>
    </details>
  );
}
