import { Link } from "react-router";
import StudentDirectory from "@/components/StudentDirectory";
import { getStudents } from "@/lib/content";
import { useAsync, useTitle } from "@/lib/hooks";

export default function Students() {
  useTitle("Students");
  const students = useAsync(getStudents);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">Students</h1>
      <p className="text-muted">
        Only students who chose to be listed appear here.{" "}
        <Link to="/students/request" className="underline">
          Request to be added
        </Link>
      </p>
      {students ? <StudentDirectory students={students} /> : <p className="text-muted">Loading students…</p>}
    </div>
  );
}
