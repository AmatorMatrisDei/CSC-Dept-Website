import { Link } from "react-router";
import SiteText from "@/components/SiteText";
import StudentDirectory from "@/components/StudentDirectory";
import { getStudents } from "@/lib/content";
import { useAsync, useTitle } from "@/lib/hooks";

export default function Students() {
  useTitle("Students");
  const students = useAsync(getStudents);

  return (
    <div className="flex flex-col gap-6">
      <SiteText id="students.title" as="h1" fallback="Students" className="text-3xl font-semibold" />
      <SiteText id="students.intro" fallback="Only students who chose to be listed appear here." className="text-muted" />
      <p>
        <Link to="/students/request" className="underline">
          Request to be added
        </Link>
      </p>
      {students ? <StudentDirectory students={students} /> : <p className="text-muted">Loading students…</p>}
    </div>
  );
}
