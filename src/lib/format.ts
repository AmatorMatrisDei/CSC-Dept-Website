import type { Project } from "./types";

// Pure helpers with no data access, safe to import from client components.

// Year filter uses date_started: newest year first.
export function projectYears(projects: Pick<Project, "date_started">[]): number[] {
  const years = new Set<number>();
  for (const p of projects) if (p.date_started) years.add(Number(p.date_started.slice(0, 4)));
  return [...years].sort((a, b) => b - a);
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

// Descriptions are plain text shown as paragraphs: no raw HTML is ever rendered.
export function paragraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}
