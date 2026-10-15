// Round placeholder for people without a photo: their initials on a tint picked from the name.
import { initials, tintFor } from "@/lib/placeholder";

export default function Portrait({
  src,
  alt,
  name,
  className = "size-16",
}: {
  src?: string | null;
  alt: string;
  name: string;
  className?: string;
}) {
  if (src) return <img src={src} alt={alt} loading="lazy" className={`${className} shrink-0 rounded-full object-cover`} />;
  return (
    <div
      aria-hidden="true"
      className={`${className} flex shrink-0 items-center justify-center rounded-full border border-border font-semibold text-accent`}
      style={{ backgroundColor: tintFor(name) }}
    >
      {initials(name)}
    </div>
  );
}
