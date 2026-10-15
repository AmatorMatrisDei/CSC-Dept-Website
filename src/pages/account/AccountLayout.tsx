import { Link, Navigate, Outlet, useLocation } from "react-router";
import type { Session } from "@supabase/supabase-js";
import { getMyRole } from "@/lib/account";
import { useSession } from "@/lib/auth";
import { useAsync, useTitle } from "@/lib/hooks";

// Wraps the signed-in pages. Visitors go to the sign-in page and come back here afterwards.
// With `reviewer`, only reviewers and admins get in (the database checks again on every action).
export default function AccountLayout({ reviewer = false }: { reviewer?: boolean }) {
  const session = useSession();
  const location = useLocation();

  if (session === undefined) return <p className="text-muted">Loading…</p>;
  if (session === null) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/account/sign-in?next=${next}`} replace />;
  }
  return reviewer ? <ReviewersOnly session={session} /> : <Outlet context={session} />;
}

function ReviewersOnly({ session }: { session: Session }) {
  const me = useAsync(getMyRole, session.user.id);
  useTitle(me && me.role === "student" ? "Reviewers only" : undefined);
  if (me === undefined) return <p className="text-muted">Loading…</p>;
  if (!me || me.role === "student") {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <h1 className="text-3xl font-semibold">Reviewers only</h1>
        <p>
          This page is for the TAs and faculty who review submissions. If you should have access, ask a site
          admin to make your account a reviewer.
        </p>
        <Link to="/account" className="inline-flex min-h-11 w-fit items-center underline">
          Go to my account
        </Link>
      </div>
    );
  }
  return <Outlet context={session} />;
}
