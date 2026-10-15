import Link from "next/link";
import { Suspense } from "react";
import StudentDirectory from "@/components/StudentDirectory";
import { getStudents } from "@/lib/content";

export const metadata = { title: "Students" };

export default async function StudentsPage() {
  const students = await getStudents();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">Students</h1>
      <p className="text-muted">
        Only students who chose to be listed appear here.{" "}
        <Link href="/students/request" className="underline">
          Request to be added
        </Link>
      </p>
      <Suspense fallback={<p className="text-muted">Loading students…</p>}>
        <StudentDirectory students={students} />
      </Suspense>
    </div>
  );
}
