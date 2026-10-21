import { useState } from "react";
import ClickToReplace from "@/components/ClickToReplace";
import Portrait from "@/components/Portrait";
import { removePersonPhoto, setPersonPhoto } from "@/lib/personPhotos";
import type { Faculty, Student } from "@/lib/types";

// Edit mode only: a student's or faculty member's picture with a button to change or remove it.
// `person` is the page as the editor sees it (with their draft), `live` is as published.
export default function EditablePortrait({
  table,
  person,
  live,
}: {
  table: "profiles" | "faculty";
  person: Student | Faculty;
  live: Student | Faculty;
}) {
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex w-fit flex-col gap-1">
      <ClickToReplace label={person.photo ? "Change" : "Add photo"} round onPick={(file) => setPersonPhoto(table, live, file)}>
        <Portrait src={person.photo?.url} alt={person.photo?.alt ?? ""} name={person.name} className="size-28 text-3xl" />
      </ClickToReplace>
      {person.photo && (
        <button
          type="button"
          onClick={async () => setMessage(await removePersonPhoto(table, live))}
          className="inline-flex min-h-11 w-fit items-center text-sm underline"
        >
          Remove photo
        </button>
      )}
      <p role="status" className="text-sm">
        {message}
      </p>
    </div>
  );
}
