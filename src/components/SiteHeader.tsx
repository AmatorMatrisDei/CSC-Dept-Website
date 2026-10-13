import Link from "next/link";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/news", label: "News" },
];

export default function SiteHeader() {
  return (
    <header className="border-b border-black/10 dark:border-white/15">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-lg font-semibold">
          Engineering &amp; Computing
        </Link>
        <nav className="flex gap-6 text-sm">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:underline">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
