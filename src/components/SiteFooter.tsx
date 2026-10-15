import { Link } from "react-router";
import SiteText from "@/components/SiteText";

export default function SiteFooter() {
  return (
    <footer className="mt-auto border-t-4 border-highlight bg-header text-header-foreground">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm">
        <SiteText id="footer.text" as="span" fallback="Department of Engineering and Computing" />
        <Link to="/about" className="inline-flex min-h-11 items-center hover:underline">
          About the department
        </Link>
      </div>
    </footer>
  );
}
