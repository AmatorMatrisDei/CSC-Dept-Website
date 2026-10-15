import { Link } from "react-router";
import Reveal from "@/components/Reveal";
import Portrait from "@/components/Portrait";
import { getAllFaculty } from "@/lib/content";
import { useAsync, useTitle } from "@/lib/hooks";

export default function FacultyList() {
  useTitle("Faculty");
  const faculty = useAsync(getAllFaculty);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">Faculty</h1>
      {!faculty ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {faculty.map((f, i) => (
            <Reveal as="li" key={f.slug} step={i % 3} className="flex">
              <div className="lift relative flex w-full items-center gap-4 rounded-lg border border-border bg-surface p-4">
              <Portrait src={f.photo?.url} alt={f.photo?.alt ?? ""} name={f.name} />
              <div>
                <h2 className="text-lg font-semibold">
                  <Link to={`/faculty/${f.slug}`} className="inline-flex min-h-11 items-center underline after:absolute after:inset-0">
                    {f.name}
                  </Link>
                </h2>
                <p className="text-sm text-muted">{f.title}</p>
              </div>
              </div>
            </Reveal>
          ))}
        </ul>
      )}
    </div>
  );
}
