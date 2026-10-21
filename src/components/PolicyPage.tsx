import SiteText from "@/components/SiteText";
import { useTitle } from "@/lib/hooks";

// A policy page (privacy, terms): a title, an introduction and sections, each editable in Edit mode
// so the department can change the wording without a code change. The text in the page files is
// what the site ships with.
export type PolicySection = { id: string; title: string; body: string };

export default function PolicyPage({
  id,
  title,
  intro,
  updated,
  sections,
}: {
  id: string;
  title: string;
  intro: string;
  updated: string;
  sections: PolicySection[];
}) {
  useTitle(title);
  return (
    <article className="flex max-w-3xl flex-col gap-8">
      <header className="flex flex-col gap-3">
        <SiteText id={`${id}.title`} as="h1" fallback={title} className="text-3xl font-semibold" />
        <SiteText id={`${id}.updated`} fallback={updated} className="text-sm text-muted" />
        <SiteText id={`${id}.intro`} multiline fallback={intro} />
      </header>
      {sections.map((s) => (
        <section key={s.id} className="flex flex-col gap-3">
          <SiteText id={`${id}.${s.id}.title`} as="h2" fallback={s.title} className="text-2xl font-semibold" />
          <SiteText id={`${id}.${s.id}`} multiline fallback={s.body} />
        </section>
      ))}
    </article>
  );
}
