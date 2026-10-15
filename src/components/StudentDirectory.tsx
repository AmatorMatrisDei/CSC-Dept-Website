"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import type { Student } from "@/lib/types";

const fieldClass = "min-h-11 w-full rounded border border-border bg-background px-3";

// The top bar links here with ?year=. The key remounts so the link always applies.
export default function StudentDirectory({ students }: { students: Student[] }) {
  const params = useSearchParams();
  return <Directory key={params.toString()} students={students} initial={Object.fromEntries(params)} />;
}

function Directory({ students, initial }: { students: Student[]; initial: Record<string, string> }) {
  const [query, setQuery] = useState(initial.q ?? "");
  const [major, setMajor] = useState(initial.major ?? "");
  const [year, setYear] = useState(initial.year ?? "");

  const years = [...new Set(students.map((s) => s.class_year))].sort((a, b) => a - b);
  const needle = query.trim().toLowerCase();
  const visible = students.filter((s) => {
    if (major && s.major !== major) return false;
    if (year && String(s.class_year) !== year) return false;
    return (
      !needle ||
      s.name.toLowerCase().includes(needle) ||
      s.skills.some((skill) => skill.toLowerCase().includes(needle))
    );
  });

  return (
    <div className="flex flex-col gap-6">
      <form
        id="search"
        role="search"
        aria-label="Filter students"
        className="grid gap-3 sm:grid-cols-3"
        onSubmit={(e) => e.preventDefault()}
      >
        <label className="flex flex-col gap-1 text-sm">
          Name or skill
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or skill"
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Major
          <select value={major} onChange={(e) => setMajor(e.target.value)} className={fieldClass}>
            <option value="">All</option>
            <option value="CSC">Computer Science</option>
            <option value="EGR">Engineering</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Class year
          <select value={year} onChange={(e) => setYear(e.target.value)} className={fieldClass}>
            <option value="">All</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </form>

      <p className="text-sm text-muted" role="status">
        Showing {visible.length} of {students.length} students
      </p>

      {visible.length === 0 ? (
        <p className="text-muted">No students match those filters.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((s) => (
            <li key={s.slug} className="rounded-lg border border-border bg-surface p-4">
              <h2 className="text-lg font-semibold">
                <Link href={`/students/${s.slug}`} className="inline-flex min-h-11 items-center underline">
                  {s.name}
                </Link>
              </h2>
              <p className="text-sm text-muted">
                {s.major} · Class of {s.class_year}
              </p>
              {s.skills.length > 0 && <p className="mt-2 text-sm">{s.skills.join(", ")}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
