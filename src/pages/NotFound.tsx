import { Link } from "react-router";
import { useTitle } from "@/lib/hooks";

export default function NotFound({ what = "page" }: { what?: string }) {
  useTitle("Not found");
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-3xl font-semibold">That {what} was not found</h1>
      <p>
        It may have moved or never existed.{" "}
        <Link to="/" className="underline">
          Go to the home page
        </Link>
      </p>
    </div>
  );
}
