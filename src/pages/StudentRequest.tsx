import { Link } from "react-router";
import { buttonClass, secondaryButtonClass } from "@/components/Form";
import { useSession } from "@/lib/auth";
import { useTitle } from "@/lib/hooks";

// How a student joins the directory (FR-3.1). The request itself is the profile form, which needs
// an account so the student's permission is recorded against them.
export default function StudentRequest() {
  const session = useSession();
  useTitle("Request to be added");
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-3xl font-semibold">Request to be added</h1>
      <p>
        Students appear in the directory only if they ask to (opt-in). To be added, sign in with your Franciscan
        University email, choose what you&apos;re happy to share, and fill in your profile. A reviewer checks it
        before it appears, and you can remove yourself at any time.
      </p>
      <ol className="list-decimal pl-5">
        <li>Create an account or sign in.</li>
        <li>Tick “List me in the student directory”, and anything else you want to show (photo, email, phone).</li>
        <li>Fill in your profile and send it for review.</li>
      </ol>
      <p>Once you&apos;re signed in you can also submit projects and internships.</p>
      <div className="flex flex-wrap gap-2">
        {session ? (
          <Link to="/account/profile" className={buttonClass}>
            Go to my profile
          </Link>
        ) : (
          <>
            <Link to="/account/sign-in?mode=sign-up&next=%2Faccount%2Fprofile" className={buttonClass}>
              Create an account
            </Link>
            <Link to="/account/sign-in?next=%2Faccount%2Fprofile" className={secondaryButtonClass}>
              Sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
