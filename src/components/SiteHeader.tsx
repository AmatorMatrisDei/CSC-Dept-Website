import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import SiteNav, { type NavMenu } from "@/components/SiteNav";
import ThemeToggle from "@/components/ThemeToggle";
import { getMyRole } from "@/lib/account";
import { useSession } from "@/lib/auth";
import { getAllFaculty, getProjects, getStudents, getSubDepartments } from "@/lib/content";
import { projectYears } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { countWaiting } from "@/lib/review";
import { CATEGORY_LABELS, STATUSES } from "@/lib/types";

// Builds the top bar menus (FR-4.2, FR-4.4, FR-4.6) so every page is within 3 clicks of Home.
export default function SiteHeader() {
  const projects = useAsync(menuProjects);
  const departments = useAsync(menuDepartments);
  const faculty = useAsync(menuFaculty);
  const students = useAsync(menuStudents);
  const session = useSession();
  const me = useAsync(roleOf, session?.user.id ?? "");
  const { pathname } = useLocation();

  const menus: NavMenu[] = [
    {
      label: "Projects",
      href: "/projects",
      groups: [
        {
          heading: "Status",
          links: STATUSES.map((s) => ({ label: s, href: `/projects?status=${s}` })),
        },
        {
          heading: "Sub-department",
          links: (departments ?? []).map((d) => ({ label: d.name, href: `/projects?department=${d.slug}` })),
        },
        {
          heading: "Year",
          links: projectYears(projects ?? []).map((y) => ({ label: String(y), href: `/projects?year=${y}` })),
        },
        {
          heading: "Showcase",
          links: Object.entries(CATEGORY_LABELS).map(([slug, label]) => ({
            label,
            href: `/projects?category=${slug}`,
          })),
        },
        { links: [{ label: "Search by title", href: "/projects#search" }] },
      ],
    },
    {
      label: "Faculty",
      href: "/faculty",
      groups: [{ links: (faculty ?? []).map((f) => ({ label: f.name, href: `/faculty/${f.slug}` })) }],
    },
    {
      label: "Students",
      href: "/students",
      groups: [
        { links: [{ label: "Search by skill", href: "/students#search" }] },
        {
          heading: "Class year",
          links: [...new Set((students ?? []).flatMap((s) => s.class_year ?? []))]
            .sort((a, b) => a - b)
            .map((y) => ({ label: String(y), href: `/students?year=${y}` })),
        },
        { links: [{ label: "Request to be added", href: "/students/request" }] },
      ],
    },
    {
      label: "Planner",
      href: "/planner",
      groups: [{ links: [{ label: "Course catalog", href: "/planner/courses" }] }],
    },
  ];

  // Reviewers and admins get a menu under My account: the review queue, and for admins, people.
  // It and the banner below the header show how many submissions are waiting (#54).
  const accountMenu = !!session && !!me && me.role !== "student";
  const waiting = useWaitingCount(accountMenu, pathname);
  if (accountMenu) {
    const links = [{ label: waiting ? `Review queue (${waiting})` : "Review queue", href: "/review" }];
    if (me.role === "admin") links.push({ label: "People and roles", href: "/people" });
    menus.push({
      label: "My account",
      href: "/account",
      allLabel: "My account",
      badge: waiting ? { count: waiting, label: waiting === 1 ? "submission waiting for review" : "submissions waiting for review" } : undefined,
      groups: [{ links }],
    });
  }

  return (
    <>
      <header className="relative border-b-4 border-highlight bg-header text-header-foreground">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-30 focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-foreground"
        >
          Skip to content
        </a>
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-2 md:flex-row md:items-center md:justify-between">
          <Link to="/" className="inline-flex min-h-11 items-center text-lg font-semibold">
            Engineering &amp; Computing
          </Link>
          <div className="flex flex-wrap items-center gap-x-2">
            <SiteNav menus={menus} />
            <AccountLinks menu={accountMenu} />
            <ThemeToggle />
          </div>
        </div>
      </header>
      {waiting && !pathname.startsWith("/review") ? <ReviewBanner count={waiting} /> : null}
    </>
  );
}

// How many submissions wait for review, for reviewers and admins: checked on each page change,
// when the tab comes back into view, and every two minutes. Null until known, or when not active.
function useWaitingCount(active: boolean, pathname: string): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!active) return;
    let current = true;
    const check = () =>
      countWaiting().then(
        (n) => {
          if (current) setCount(n);
        },
        () => {}, // a failed check leaves the last count; the header never shows an error
      );
    void check();
    const timer = window.setInterval(check, 120_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      current = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, pathname]);
  return active ? count : null;
}

// A bar under the header for reviewers and admins while submissions are waiting.
function ReviewBanner({ count }: { count: number }) {
  return (
    <div role="status" className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 text-sm">
        <p>
          <span aria-hidden="true" className="mr-2 inline-block size-2 rounded-full bg-highlight align-middle" />
          {count === 1 ? "1 submission is waiting for review." : `${count} submissions are waiting for review.`}
        </p>
        <Link to="/review" className="inline-flex min-h-11 items-center font-medium underline">
          Open the review queue
        </Link>
      </div>
    </div>
  );
}

// The header sits outside the page's error boundary, so none of its loads may throw. If a list
// can't load, its menu shows just its main link; if the role can't, the account menu is plain.
function orEmpty<T>(load: () => Promise<T[]>) {
  return () => load().catch((): T[] => []);
}
const menuProjects = orEmpty(getProjects);
const menuDepartments = orEmpty(getSubDepartments);
const menuFaculty = orEmpty(getAllFaculty);
const menuStudents = orEmpty(getStudents);
const roleOf = async (userId: string) => (userId ? getMyRole(userId).catch(() => null) : null);

const accountLinkClass = "inline-flex min-h-11 items-center rounded px-3 text-sm hover:bg-current/10";

// Sign in, or the signed-in person's account (and the review queue for reviewers).
function AccountLinks({ menu }: { menu: boolean }) {
  const session = useSession();
  if (session === undefined) return null;
  if (!session) {
    return (
      <Link to="/account/sign-in" className={accountLinkClass}>
        Sign in
      </Link>
    );
  }
  return menu ? null : <SignedInLinks />;
}

function SignedInLinks() {
  return (
    <Link to="/account" className={accountLinkClass}>
      My account
    </Link>
  );
}
