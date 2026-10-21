import { paragraphs } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { Policy } from "@/lib/policies";

// A policy page (privacy, terms), drawn from src/lib/policies.ts. The build writes the same wording
// as plain HTML for readers without JavaScript, so the page has no Edit-mode text: one source keeps
// the two copies identical.
export default function PolicyPage({ policy }: { policy: Policy }) {
  useTitle(policy.title);
  return (
    <article className="flex max-w-3xl flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold">{policy.title}</h1>
        <p className="text-sm text-muted">{policy.updated}</p>
        {paragraphs(policy.intro).map((text, i) => (
          <p key={i}>{text}</p>
        ))}
      </header>
      {policy.sections.map((section) => (
        <section key={section.id} className="flex flex-col gap-3">
          <h2 className="text-2xl font-semibold">{section.title}</h2>
          {paragraphs(section.body).map((text, i) => (
            <p key={i}>{text}</p>
          ))}
        </section>
      ))}
    </article>
  );
}
