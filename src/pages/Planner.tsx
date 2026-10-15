import { useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { Notice, buttonClass, fieldClass, secondaryButtonClass } from "@/components/Form";
import { getMyRole } from "@/lib/account";
import { useSession } from "@/lib/auth";
import { useAsync, useTitle } from "@/lib/hooks";
import { forgetPlannerData, loadPlannerData, saveSuggestedPlan } from "@/lib/planner/data";
import { downloadCsv, downloadExcel } from "@/lib/planner/export";
import {
  MAX_CREDITS,
  addCourse,
  itemCredits,
  moveItem,
  removeItem,
  semesterCredits,
  semesterLabel,
  suggestedPlan,
  warnings,
} from "@/lib/planner/plan";
import { emptyState, getPlannerState, savePlannerState, type PlannerState } from "@/lib/planner/store";
import type { Course, Degree, Plan, PlannerData, SuggestedSemester } from "@/lib/planner/types";

// Experimental degree planner. Anyone can preview the suggested sequence for each major. Signed-in
// people build their own plan, saved to their account. Admins can also edit the suggested plans
// here and the courses on the course catalog page.

type Mode = "suggested" | "mine" | "admin";

function toSemesters(plan: Plan, degree: Degree): SuggestedSemester[] {
  return plan.map((items, s) => ({
    ...degree.semesters[s],
    entries: items.map((i) => (i.course ? { course: i.course } : { slot: i.slot ?? "Elective", credits: i.credits })),
  }));
}

export default function Planner() {
  useTitle("Degree planner");
  const data = useAsync(loadPlannerData);
  const session = useSession();
  if (!data || session === undefined) return <p className="text-muted">Loading…</p>;
  return session ? <AccountPlanner data={data} userId={session.user.id} /> : <Workspace data={data} userId={null} initial={emptyState()} isAdmin={false} />;
}

function AccountPlanner({ data, userId }: { data: PlannerData; userId: string }) {
  const initial = useAsync(getPlannerState, userId);
  const me = useAsync(getMyRole, userId);
  if (!initial || me === undefined) return <p className="text-muted">Loading…</p>;
  return <Workspace data={data} userId={userId} initial={initial} isAdmin={me?.role === "admin"} />;
}

function Workspace({ data, userId, initial, isAdmin }: { data: PlannerData; userId: string | null; initial: PlannerState; isAdmin: boolean }) {
  const [state, setState] = useState(initial);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, SuggestedSemester[]>>({});
  const [adminEditing, setAdminEditing] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const base = data.degrees.find((d) => d.id === state.degree) ?? data.degrees.find((d) => d.id === "BS_CS") ?? data.degrees[0];
  const degree: Degree = edits[base.id] ? { ...base, semesters: edits[base.id] } : base;
  const mode: Mode = !userId ? "suggested" : adminEditing ? "admin" : state.mode;

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
          Plan your four years in the department. Nothing here is an official record, so check your plan with an advisor.
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

      <UserGuide signedIn={!!userId} />
      {isAdmin && <AdminGuide />}

      <label className="flex max-w-md flex-col gap-1 font-medium">
        Major
        <select
          value={degree.id}
          disabled={adminEditing}
          onChange={(e) => update({ ...state, degree: e.target.value })}
          className={fieldClass}
        >
          {data.degrees.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>

      {userId && (
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Plan view" className="flex gap-2">
            {(["suggested", "mine"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                disabled={adminEditing}
                onClick={() => update({ ...state, mode: m })}
                className={`min-h-11 rounded border px-4 py-2 font-medium disabled:opacity-60 ${mode === m ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface hover:border-highlight"}`}
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

      <PlanView
        key={`${degree.id}-${mode}`}
        degree={degree}
        courses={data.courses}
        mode={mode}
        state={state}
        onState={update}
        isAdmin={isAdmin}
        onAdminEdit={setAdminEditing}
        onSaved={(semesters) => setEdits((e) => ({ ...e, [degree.id]: semesters }))}
      />
    </div>
  );
}

function UserGuide({ signedIn }: { signedIn: boolean }) {
  return (
    <details className="rounded-lg border border-border bg-surface p-4">
      <summary className="min-h-11 cursor-pointer py-2 font-medium">How to use the planner</summary>
      <ul className="list-disc pl-5 pt-2 text-sm">
        <li>Pick your major. The suggested plan is the department's recommended order of courses, eight semesters over four years.</li>
        <li>Open "About this course" under a course to read what it covers.</li>
        {signedIn ? (
          <>
            <li>
              Switch to <strong>My plan</strong> to make it your own. Drag a course card onto another semester, or use its "Move to" menu,
              which also works with a keyboard or on a phone. Use "Remove" to take a course out.
            </li>
            <li>Search by course code or title under "Add a course" to put more courses in your plan.</li>
            <li>
              Tick <strong>Completed</strong> on courses you have finished. They count as done when the planner checks prerequisites.
            </li>
            <li>
              Warnings appear when a course needs a prerequisite you have not planned earlier, or is only offered in a different
              semester. A semester over {MAX_CREDITS} credits is marked too. They are guidance, not rules, so check with your advisor.
            </li>
            <li>Your plan saves to your account as you go. "Reset to suggested" starts over. Download Excel or CSV for a copy.</li>
          </>
        ) : (
          <li>
            <Link to="/account/sign-in?next=/planner" className="underline">
              Sign in
            </Link>{" "}
            to build your own plan: drag courses between semesters, add courses, mark what you have completed, and get warnings about
            prerequisites. It saves to your account.
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
          The planner reads everything from the database, so changes here show up for everyone as soon as you save.
        </p>
        <ul className="list-disc pl-5">
          <li>
            <strong>Courses:</strong> open the{" "}
            <Link to="/planner/courses" className="underline">
              course catalog
            </Link>{" "}
            to add a course, change its title or credits, list its prerequisites and corequisites, or delete it.
          </li>
          <li>
            <strong>Offered terms:</strong> tick Fall and/or Spring on a course if it is only taught then. A student who places it in
            another semester sees a warning. Leave all unticked if it is taught any term.
          </li>
          <li>
            <strong>Suggested plans:</strong> pick a major, press "Edit suggested plan", move or add courses like a student does, then
            press Save. The warnings show while you edit, so you can check the sequence.
          </li>
          <li>
            <strong>Prerequisites</strong> are written as course codes, such as CSC 120. Deleting a course does not remove it from
            plans that already use it, so move it out of the suggested plans first.
          </li>
        </ul>
      </div>
    </details>
  );
}

function PlanView({
  degree,
  courses,
  mode,
  state,
  onState,
  isAdmin,
  onAdminEdit,
  onSaved,
}: {
  degree: Degree;
  courses: Map<string, Course>;
  mode: Mode;
  state: PlannerState;
  onState: (next: PlannerState) => void;
  isAdmin: boolean;
  onAdminEdit: (editing: boolean) => void;
  onSaved: (semesters: SuggestedSemester[]) => void;
}) {
  const suggested = useMemo(() => suggestedPlan(degree), [degree]);
  const stored = state.plans[degree.id];
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
  const problems = useMemo(() => (editing ? warnings(plan, courses, mode === "admin" ? new Set() : completed) : []), [editing, plan, courses, completed, mode]);
  const total = plan.reduce((sum, items) => sum + semesterCredits(items, courses), 0);

  function change(next: Plan) {
    if (mode === "admin") setDraft(next);
    else onState({ ...state, plans: { ...state.plans, [degree.id]: next } });
  }

  function toggle(id: string) {
    const next = new Set(completed);
    if (!next.delete(id)) next.add(id);
    onState({ ...state, completed: [...next] });
  }

  async function saveSuggested() {
    setBusy(true);
    const semesters = toSemesters(draft, degree);
    const error = await saveSuggestedPlan(degree.id, semesters);
    setBusy(false);
    if (error) return setNote(error);
    forgetPlannerData();
    onSaved(semesters);
    onAdminEdit(false);
  }

  const placed = new Set(plan.flat().flatMap((i) => (i.course ? [i.course] : [])));
  const query = search.trim().toLowerCase();
  const matches = query
    ? [...courses.values()]
        .filter((c) => !placed.has(c.id) && (c.code.toLowerCase().includes(query) || c.title.toLowerCase().includes(query)))
        .sort((a, b) => Number(!a.code.toLowerCase().startsWith(query)) - Number(!b.code.toLowerCase().startsWith(query)) || a.code.localeCompare(b.code))
        .slice(0, 8)
    : [];

  const fileName = `${degree.id}-${mode === "mine" ? "my-plan" : "suggested-plan"}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void downloadExcel(plan, courses, completed, fileName, `${degree.name} plan`)} className={secondaryButtonClass}>
          Download Excel (.xlsx)
        </button>
        <button type="button" onClick={() => downloadCsv(plan, courses, completed, fileName)} className={secondaryButtonClass}>
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
            ? `Editing the suggested plan for ${degree.name}. It changes for everyone when you press Save.`
            : `${degree.name} recommended sequence. Your actual schedule may vary.`}{" "}
        {total} credits planned of {degree.totalCredits} needed.
      </p>
      {degree.autoGenerated && (
        <p className="rounded-lg border border-border bg-surface p-3 text-sm">
          This plan was generated from course prerequisites. Check it with your academic advisor.
        </p>
      )}

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
                    {semesterLabel(s)}
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
                  {c.title} · {c.credits} cr
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
        {[0, 1, 2, 3].map((year) => (
          <section key={year} aria-labelledby={`year-${year}`} className="flex flex-col gap-2">
            <h2 id={`year-${year}`} className="text-lg font-semibold">
              Year {year + 1}
            </h2>
            <ol className="grid gap-3 md:grid-cols-2">
              {[year * 2, year * 2 + 1].map((s) => {
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
                      <h3 className="font-semibold">{s % 2 === 0 ? "Fall" : "Spring"}</h3>
                      <span className={`text-sm ${tooMany ? "font-semibold" : "text-muted"}`}>
                        {credits} cr{tooMany ? ` (over ${MAX_CREDITS})` : ""}
                      </span>
                    </div>
                    {!editing && degree.semesters[s].note && <p className="text-sm text-muted">{degree.semesters[s].note}</p>}
                    {items.length === 0 && <p className="text-sm text-muted">Nothing planned.</p>}
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
                            {course?.description && (
                              <details className="text-sm">
                                <summary className="flex min-h-11 cursor-pointer items-center underline md:min-h-7">
                                  About this course<span className="sr-only"> {course.code}</span>
                                </summary>
                                <p className="pb-1 text-muted">{course.description}</p>
                              </details>
                            )}
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
                                        {semesterLabel(n)}
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
                                  to={`/planner/courses#${course.id}`}
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
                delete rest[degree.id];
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
