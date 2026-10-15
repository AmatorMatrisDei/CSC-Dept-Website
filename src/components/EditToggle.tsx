import { Link } from "react-router";
import { useAuth } from "@/lib/auth";

// Header control for signed-in people. Visitors see nothing. Admins get an Edit mode switch,
// reviewers and admins get the review page, and everyone gets their account page.
export default function EditToggle() {
  const { email, isAdmin, isReviewer, editing, setEditing, signOut } = useAuth();
  if (!email) return null;

  const item = "inline-flex min-h-11 items-center rounded px-3 hover:bg-surface";

  return (
    <div className="flex flex-wrap items-center gap-x-1 text-sm">
      {isAdmin && (
        <button type="button" role="switch" aria-checked={editing} onClick={() => setEditing(!editing)} className={`${item} gap-2`}>
          <span aria-hidden="true" className={`inline-block h-5 w-9 rounded-full p-0.5 ${editing ? "bg-accent" : "bg-border"}`}>
            <span className={`block size-4 rounded-full bg-white transition-transform motion-reduce:transition-none ${editing ? "translate-x-4" : ""}`} />
          </span>
          Edit mode
        </button>
      )}
      {isReviewer && (
        <Link to="/admin" className={item}>
          Review
        </Link>
      )}
      <Link to="/account" className={item}>
        My account
      </Link>
      <button type="button" onClick={() => void signOut()} className={item}>
        Sign out
      </button>
    </div>
  );
}
