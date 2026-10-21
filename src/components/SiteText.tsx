import type { ElementType } from "react";
import Editable from "@/components/Editable";
import { useEdit } from "@/lib/edit";
import { paragraphs } from "@/lib/format";
import { saveSiteText, useSiteText } from "@/lib/siteText";

// A piece of page wording that staff can edit in place. `id` names it in the database and
// `fallback` is the wording the site ships with. Long text (`multiline`) keeps its paragraphs.
export default function SiteText({
  id,
  fallback,
  as = "p",
  multiline = false,
  label,
  className,
}: {
  id: string;
  fallback: string;
  as?: ElementType;
  multiline?: boolean;
  label?: string;
  className?: string;
}) {
  const { editing } = useEdit();
  const value = useSiteText(id, fallback, editing);
  return (
    <Editable
      as={multiline ? "div" : as}
      label={label ?? id.replace(/[._]/g, " ")}
      value={value}
      multiline={multiline}
      maxLength={multiline ? 20000 : 300}
      onSave={(next) => saveSiteText(id, next)}
      className={multiline ? `flex flex-col gap-4 ${className ?? ""}` : className}
    >
      {multiline ? paragraphs(value).map((t, i) => <p key={i}>{t}</p>) : value}
    </Editable>
  );
}
