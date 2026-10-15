import SiteText from "@/components/SiteText";
import { useTitle } from "@/lib/hooks";

export default function About() {
  useTitle("About");
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <SiteText id="about.title" as="h1" fallback="About the department" className="text-3xl font-semibold" />
      <SiteText
        id="about.body"
        multiline
        fallback="Placeholder text. The department will supply the real description, contact details and sub-department summaries."
      />
    </div>
  );
}
