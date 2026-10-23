import { useState } from "react";
import { useSignedInSession } from "@/lib/auth";
import { Notice, fieldClass } from "@/components/Form";
import { getMyRole, type Role } from "@/lib/account";
import { useAction, useAsync, useTitle } from "@/lib/hooks";
import { getPeople, setRole, type Person } from "@/lib/people";

const ROLES: { value: Role; label: string }[] = [
  { value: "student", label: "Student" },
  { value: "reviewer", label: "Reviewer" },
  { value: "faculty", label: "Faculty" },
  { value: "admin", label: "Admin" },
];

// Admins promote or demote other accounts here instead of running SQL.
export default function People() {
  const session = useSignedInSession();
  const me = useAsync(getMyRole, session.user.id);
  useTitle("People and roles");
  if (me === undefined) return <p className="text-muted">Loading…</p>;
  if (me?.role !== "admin") {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <h1 className="text-3xl font-semibold">Admins only</h1>
        <p>Only admins can change who reviews submissions or edits the site.</p>
      </div>
    );
  }
  return <PeopleList myId={session.user.id} />;
}

function PeopleList({ myId }: { myId: string }) {
  const [version, setVersion] = useState(0);
  const [query, setQuery] = useState("");
  const people = useAsync(getPeople, version);
  const { busy, error, run } = useAction();
  const [done, setDone] = useState<string | null>(null);

  if (people === undefined) return <p className="text-muted">Loading…</p>;

  const q = query.trim().toLowerCase();
  const shown = people.filter((p) => !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q));

  function change(person: Person, role: Role) {
    const verb = role === "admin" ? "make an admin" : role === "faculty" ? "make faculty" : role === "reviewer" ? "make a reviewer" : "make a student";
    if (!window.confirm(`${person.name || "This person"}: ${verb}? Faculty edit most of the site and approve or reject submissions; admins can also change roles and site settings.`)) return;
    setDone(null);
    void run(async () => {
      await setRole(person.id, role);
      setVersion((v) => v + 1);
      setDone(`${person.name || "That person"} is now ${role === "admin" ? "an admin" : role === "faculty" ? "faculty" : `a ${role}`}.`);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">People and roles</h1>
        <p className="max-w-2xl text-muted">
          Reviewers approve submissions. Faculty also edit most of the site. Admins also manage roles and site settings. People must have signed up and verified
          their email address first. The email is the one they signed up with. Role changes are logged.
        </p>
      </header>
      <label className="flex max-w-md flex-col gap-1 font-medium">
        Find someone
        <input value={query} onChange={(e) => setQuery(e.target.value)} className={fieldClass} placeholder="Name or email" />
      </label>
      {error && <Notice tone="error">{error}</Notice>}
      {done && <Notice tone="success">{done}</Notice>}
      <ul className="flex flex-col gap-3">
        {shown.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4">
            <div>
              <p className="font-medium">
                {p.name || "(no name yet)"}
                {p.id === myId && <span className="ml-2 text-sm font-normal text-muted">you</span>}
              </p>
              <p className="text-sm text-muted">
                {p.email}
                {!p.verified && " · email not verified yet, so can't be a reviewer, faculty or admin"}
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              Role
              <select
                value={p.role}
                disabled={busy || p.id === myId}
                onChange={(e) => change(p, e.target.value as Role)}
                aria-label={`Role for ${p.name || "this person"}`}
                className={`${fieldClass} !w-auto`}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value} disabled={!p.verified && r.value !== "student"}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          </li>
        ))}
        {shown.length === 0 && <li className="text-muted">No one matches.</li>}
      </ul>
      <p className="text-sm text-muted">You can't change your own role, so there is always at least one admin.</p>
    </div>
  );
}
