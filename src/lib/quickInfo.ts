import type { Faculty, Photo, Student } from "./types";

// What the profile picture pop-up (QuickView) shows for a person.
export type QuickInfo = {
  name: string;
  photo: Photo | null;
  subtitle?: string; // a student's headline, a faculty member's title
  details?: string[]; // short lines such as "Computer Science · Class of 2027"
  email?: string | null;
  phone?: string | null;
  links?: { label: string; url: string }[];
  href?: string; // the full profile; left out on the profile page itself
};

export function studentQuickInfo(s: Student, linkToProfile = true): QuickInfo {
  const parts = [s.major, s.class_year ? `Class of ${s.class_year}` : null].filter((x): x is string => !!x);
  // Skip the line when the headline already says it ("Computer Science, Class of 2027").
  const repeated = parts.every((part) => s.headline.toLowerCase().includes(part.toLowerCase()));
  return {
    name: s.name,
    photo: s.photo,
    subtitle: s.headline || undefined,
    details: [
      repeated ? "" : parts.join(" · "),
      s.skills.length ? `Skills: ${s.skills.slice(0, 6).join(", ")}` : "",
    ].filter(Boolean),
    email: s.email,
    phone: s.phone,
    links: studentLinks(s),
    href: linkToProfile ? `/students/${s.slug}` : undefined,
  };
}

export function facultyQuickInfo(f: Faculty, linkToProfile = true): QuickInfo {
  return {
    name: f.name,
    photo: f.photo,
    subtitle: f.title || undefined,
    email: f.email,
    href: linkToProfile ? `/faculty/${f.slug}` : undefined,
  };
}

// The links a student chose to show, in a fixed order.
export function studentLinks(s: Pick<Student, "linkedin_url" | "github_url" | "website_url">) {
  return ([["LinkedIn", s.linkedin_url], ["GitHub", s.github_url], ["Website", s.website_url]] as const).flatMap(
    ([label, url]) => (url ? [{ label, url }] : []),
  );
}
