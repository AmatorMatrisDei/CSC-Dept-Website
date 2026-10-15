import Link from "next/link";
import { getAllFaculty } from "@/lib/content";

export const metadata = { title: "Faculty" };

export default async function FacultyPage() {
  const faculty = await getAllFaculty();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">Faculty</h1>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {faculty.map((f) => (
          <li key={f.slug} className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-lg font-semibold">
              <Link href={`/faculty/${f.slug}`} className="inline-flex min-h-11 items-center underline">
                {f.name}
              </Link>
            </h2>
            <p className="text-sm text-muted">{f.title}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
