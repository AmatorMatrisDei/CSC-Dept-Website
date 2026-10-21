import { useState } from "react";
import { useEdit } from "@/lib/edit";
import { safeLink } from "@/lib/list";
import { changeSiteList, useSiteList, type ListItem } from "@/lib/siteText";

// A list of short entries (title, text, optional link) that staff can add to, remove from and
// reorder in Edit mode. `id` must end in ".items". Visitors see nothing at all while it is empty.
const MAX_ITEMS = 30;
const blank: ListItem = { title: "", text: "", url: "" };

function ItemFields({
  item,
  label,
  onCommit,
}: {
  item: ListItem;
  label: string;
  onCommit: (next: ListItem) => void;
}) {
  const [draft, setDraft] = useState(item);
  // When the saved item changes (moved, or saved from elsewhere), show it.
  const [shownItem, setShownItem] = useState(item);
  if (item.title !== shownItem.title || item.text !== shownItem.text || item.url !== shownItem.url) {
    setShownItem(item);
    setDraft(item);
  }
  const field = "w-full rounded border border-border bg-surface p-2 text-inherit";
  const commit = () => {
    if (draft.title !== item.title || draft.text !== item.text || draft.url !== item.url)
      onCommit(draft);
  };
  return (
    <div className="flex flex-col gap-2">
      <input
        aria-label={`${label}: title`}
        value={draft.title}
        maxLength={120}
        placeholder="Title"
        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        onBlur={commit}
        className={field}
      />
      <textarea
        aria-label={`${label}: text`}
        value={draft.text}
        maxLength={2000}
        rows={3}
        placeholder="Text"
        onChange={(e) => setDraft({ ...draft, text: e.target.value })}
        onBlur={commit}
        className={field}
      />
      <input
        aria-label={`${label}: link`}
        value={draft.url}
        maxLength={255}
        placeholder="Link (https://… or /page), optional"
        onChange={(e) => setDraft({ ...draft, url: e.target.value })}
        onBlur={commit}
        className={field}
      />
    </div>
  );
}

export default function SiteList({
  id,
  addLabel = "Add an item",
  className,
}: {
  id: string;
  addLabel?: string;
  className?: string;
}) {
  const { editing } = useEdit();
  const items = useSiteList(id, editing);
  const [message, setMessage] = useState<string | null>(null);

  async function save(change: (items: ListItem[]) => ListItem[]) {
    setMessage(await changeSiteList(id, change));
  }

  if (!editing) {
    const shown = items.filter((item) => item.title || item.text);
    if (shown.length === 0) return null;
    return (
      <ul className={`flex flex-col gap-4 ${className ?? ""}`}>
        {shown.map((item, i) => (
          <li key={i} className="flex flex-col gap-1">
            {item.title && (
              <p className="text-lg font-semibold">
                {safeLink(item.url) ? (
                  <a
                    href={item.url}
                    className="underline"
                    {...(item.url.startsWith("http") ? { rel: "noopener noreferrer" } : {})}
                  >
                    {item.title}
                  </a>
                ) : (
                  item.title
                )}
              </p>
            )}
            {item.text && <p>{item.text}</p>}
          </li>
        ))}
      </ul>
    );
  }

  const button =
    "min-h-11 rounded border border-border px-3 text-sm hover:bg-current/10 disabled:opacity-50";
  const move = (from: number, to: number) =>
    void save((list) => {
      const next = [...list];
      next.splice(to, 0, next.splice(from, 1)[0]);
      return next;
    });
  return (
    <div className={`flex flex-col gap-3 ${className ?? ""}`}>
      <ol className="flex flex-col gap-4">
        {items.map((item, i) => {
          const label = `Item ${i + 1}`;
          return (
            <li
              key={i}
              className="flex flex-col gap-2 rounded border border-dashed border-accent/60 p-3"
            >
              <ItemFields
                item={item}
                label={label}
                onCommit={(next) => void save((list) => list.map((x, j) => (j === i ? next : x)))}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={button}
                  disabled={i === 0}
                  aria-label={`Move ${label} up`}
                  onClick={() => move(i, i - 1)}
                >
                  Move up
                </button>
                <button
                  type="button"
                  className={button}
                  disabled={i === items.length - 1}
                  aria-label={`Move ${label} down`}
                  onClick={() => move(i, i + 1)}
                >
                  Move down
                </button>
                <button
                  type="button"
                  className={button}
                  aria-label={`Remove ${label}`}
                  onClick={() => void save((list) => list.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className={button}
          disabled={items.length >= MAX_ITEMS}
          onClick={() => void save((list) => (list.length >= MAX_ITEMS ? list : [...list, blank]))}
        >
          {addLabel}
        </button>
        <span className="text-sm text-muted" role="status">
          {message}
        </span>
      </div>
    </div>
  );
}
