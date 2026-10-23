import { Link } from "react-router";
import { useEffect, useRef, useState } from "react";

export type NavLink = { label: string; href: string };
// `badge` is a count shown beside the menu's name, such as submissions waiting for review.
export type NavMenu = {
  label: string;
  href: string;
  allLabel?: string;
  badge?: { count: number; label: string };
  groups: { heading?: string; links: NavLink[] }[];
};

// Top bar menus. Each is a button that opens a panel of links. Works with the keyboard
// (Tab to the button, Enter/Space to open, Escape to close) and closes on outside click.
export default function SiteNav({ menus }: { menus: NavMenu[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(null);
        root.current?.querySelector<HTMLButtonElement>(`[data-menu="${open}"]`)?.focus();
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <nav ref={root} aria-label="Main" className="-mx-3 flex flex-wrap text-sm md:relative">
      {menus.map((menu) => {
        const isOpen = open === menu.label;
        return (
          <div key={menu.label} className="md:relative">
            <button
              type="button"
              data-menu={menu.label}
              aria-expanded={isOpen}
              aria-controls={`menu-${menu.label}`}
              onClick={() => setOpen(isOpen ? null : menu.label)}
              className="inline-flex min-h-11 items-center gap-1 rounded px-3 hover:bg-current/10"
            >
              {menu.label}
              {menu.badge && menu.badge.count > 0 && (
                <span className="rounded-full bg-header-foreground px-1.5 text-xs font-semibold text-header">
                  {menu.badge.count}
                  <span className="sr-only"> {menu.badge.label}</span>
                </span>
              )}
              <span aria-hidden="true" className="text-xs">
                {isOpen ? "▴" : "▾"}
              </span>
            </button>
            {isOpen && (
              <div
                id={`menu-${menu.label}`}
                className="menu-panel absolute left-0 right-0 z-20 mt-1 max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-background p-3 text-foreground shadow-lg md:left-0 md:right-auto md:w-72"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("a")) setOpen(null);
                }}
              >
                <Link
                  to={menu.href}
                  className="flex min-h-11 items-center rounded px-2 font-medium hover:bg-surface"
                >
                  {menu.allLabel ?? `All ${menu.label.toLowerCase()}`}
                </Link>
                {menu.groups.filter((group) => group.links.length > 0).map((group, i) => (
                  <div key={i} className="mt-2 border-t border-border pt-2">
                    {group.heading && (
                      <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted">
                        {group.heading}
                      </p>
                    )}
                    <ul>
                      {group.links.map((link) => (
                        <li key={link.href + link.label}>
                          <Link
                            to={link.href}
                            className="flex min-h-11 items-center rounded px-2 hover:bg-surface"
                          >
                            {link.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
