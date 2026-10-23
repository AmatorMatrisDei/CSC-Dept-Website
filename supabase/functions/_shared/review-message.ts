// The chat message for a submission waiting for review (#54). Chats are outside the university's
// systems, so it says what kind of submission it is and its project or internship title, and
// links to the review page, where reviewers sign in to see the rest. It never names the student.

export type Submission = {
  id: string;
  target_type: "profile" | "project" | "internship";
  action: "create" | "update" | "delete";
  title?: string | null;
  resubmitted?: boolean;
};

// Titles come from students, so they're kept to one short line.
function clean(title: string | null | undefined): string {
  const line = (title ?? "").replace(/\s+/g, " ").trim();
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}

function describe({ target_type, action, title }: Submission): string {
  const name = clean(title);
  if (target_type === "project") {
    const project = name ? `the project "${name}"` : "a project";
    if (action === "create") return name ? `a new project, "${name}"` : "a new project";
    return action === "update" ? `changes to ${project}` : `a request to remove ${project}`;
  }
  if (target_type === "internship") {
    const internship = name ? `an internship at ${name}` : "an internship";
    if (action === "create") return name ? `a new internship at ${name}` : "a new internship";
    return action === "update" ? `changes to ${internship}` : `a request to remove ${internship}`;
  }
  if (action === "create") return "a request to be added to the student directory";
  return action === "update" ? "profile changes" : "a request to be removed from the student directory";
}

// Two lines: what's waiting, then the link to review it.
export function reviewMessage(submission: Submission, siteUrl: string): string {
  const heading = submission.resubmitted ? "Resubmitted for review" : "New for review";
  return `${heading}: ${describe(submission)}\n${siteUrl.replace(/\/+$/, "")}/review/${submission.id}`;
}
