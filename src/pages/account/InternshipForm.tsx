import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { Fieldset, Notice, TextArea, TextField, buttonClass } from "@/components/Form";
import {
  getInternship,
  getSubmission,
  resubmitChange,
  submitChange,
  type Internship,
  type InternshipFields,
  type Submission,
} from "@/lib/account";
import { useAction, useAsync, useTitle } from "@/lib/hooks";
import NotFound from "@/pages/NotFound";

// A student's own internships (FR-1.8), shown on their profile while they're in the directory.

async function loadForm(internshipId: string, changeId: string) {
  const [internship, change] = await Promise.all([
    internshipId ? getInternship(internshipId) : null,
    changeId ? getSubmission(changeId) : null,
  ]);
  return { internship, change };
}

export default function InternshipForm() {
  const { id: internshipId = "" } = useParams();
  const [params] = useSearchParams();
  const changeId = params.get("change") ?? "";
  const loaded = useAsync(loadForm, internshipId, changeId);
  useTitle(internshipId ? "Edit internship" : "Add an internship");

  if (!loaded) return <p className="text-muted">Loading…</p>;
  if (internshipId && !loaded.internship) return <NotFound what="internship" />;
  const change =
    loaded.change?.target_type === "internship" && loaded.change.status === "changes_requested" ? loaded.change : null;
  return <Editor key={`${internshipId}:${changeId}`} internship={loaded.internship} change={change} />;
}

function Editor({ internship, change }: { internship: Internship | null; change: Submission | null }) {
  const start: InternshipFields = {
    company: "", term: "", description: "",
    ...internship,
    ...(change?.proposed_data as Partial<InternshipFields> | undefined),
  };
  const [company, setCompany] = useState(start.company);
  const [term, setTerm] = useState(start.term);
  const [description, setDescription] = useState(start.description);
  const { busy, error, run } = useAction();
  const navigate = useNavigate();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link to="/account" className="inline-flex min-h-11 w-fit items-center text-sm underline">
          My account
        </Link>
        <h1 className="text-3xl font-semibold">{internship ? `Edit ${internship.company}` : "Add an internship"}</h1>
        <p className="text-muted">It appears on your profile once a reviewer approves it, while you&apos;re in the directory.</p>
      </header>
      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const proposed: InternshipFields = { company: company.trim(), term: term.trim(), description: description.trim() };
            if (change) await resubmitChange(change.id, proposed);
            else if (internship) await submitChange({ target_type: "internship", action: "update", target_id: internship.id, proposed_data: proposed });
            else await submitChange({ target_type: "internship", action: "create", proposed_data: proposed });
            navigate("/account", { state: { message: "Your internship was sent for review." } });
          });
        }}
      >
        {change?.reason && (
          <Notice>
            <strong>The reviewer asked:</strong> {change.reason}
          </Notice>
        )}
        <Fieldset legend="Internship">
          <TextField label="Company" required value={company} onChange={setCompany} maxLength={200} />
          <TextField label="Term" value={term} onChange={setTerm} maxLength={50} hint="e.g. Summer 2026" />
          <TextArea label="What you worked on" value={description} onChange={setDescription} maxLength={2000} rows={5}
            hint="A few sentences. Leave out anything confidential to the employer." />
        </Fieldset>
        {error && <Notice tone="error">{error}</Notice>}
        <button type="submit" className={`${buttonClass} w-fit`} disabled={busy}>
          {busy ? "Sending…" : change ? "Send back for review" : "Send for review"}
        </button>
      </form>
    </div>
  );
}
