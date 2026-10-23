import { Link } from "react-router";
import Portrait from "@/components/Portrait";
import type { Highlight } from "@/lib/highlights";

// One person on the home page. A student is a photo with their name, major and a line about them;
// an alumni story leads with the quote, so the two never look like the same card twice.
export default function HighlightCard({ item }: { item: Highlight }) {
  if (item.kind === "alumni") {
    return (
      <li className="lift flex h-full flex-col gap-3 wrap-anywhere rounded-lg border border-border border-l-4 border-l-accent bg-surface p-4">
        {item.blurb && <blockquote className="text-lg">“{item.blurb}”</blockquote>}
        <div className="mt-auto flex items-center gap-3">
          <Portrait src={item.image} alt="" name={item.name} className="size-12" />
          <div>
            <p className="font-semibold">{item.name}</p>
            <p className="text-sm text-muted">{item.detail}</p>
          </div>
        </div>
      </li>
    );
  }
  return (
    <li className="lift relative flex h-full flex-col items-center gap-3 wrap-anywhere rounded-lg border border-border bg-surface p-4 text-center">
      <Portrait src={item.image} alt="" name={item.name} className="size-24" />
      <h3 className="text-lg font-semibold">
        {item.kind === "student" && item.slug ? (
          <Link to={`/students/${item.slug}`} className="after:absolute after:inset-0 hover:underline">
            {item.name}
          </Link>
        ) : (
          item.name
        )}
      </h3>
      {item.detail && <p className="text-sm text-muted">{item.detail}</p>}
      {item.blurb && <p>{item.blurb}</p>}
    </li>
  );
}
