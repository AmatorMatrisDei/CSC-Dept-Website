import { initials, tintFor } from "@/lib/placeholder";

// Every cover image sits in one fixed 16:9 frame and is cropped to fit, so layouts never jump.
// Without an image, a placeholder shows the initials of `label` on a tint picked from the label,
// so each project looks different. It is decorative (hidden from screen readers).
export default function Cover({
  src,
  alt,
  label = "",
  className = "",
}: {
  src: string | null;
  alt: string;
  label?: string;
  className?: string;
}) {
  return (
    <div className={`aspect-video overflow-hidden bg-surface ${className}`}>
      {src ? (
        <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-105" />
      ) : (
        <div
          aria-hidden="true"
          className="flex h-full w-full items-center justify-center text-5xl transition-transform duration-500 motion-safe:group-hover:scale-105 font-semibold tracking-wide text-accent"
          style={{
            backgroundColor: tintFor(label),
            backgroundImage:
              "repeating-linear-gradient(135deg, color-mix(in srgb, var(--accent) 8%, transparent) 0 2px, transparent 2px 16px)",
          }}
        >
          {initials(label)}
        </div>
      )}
    </div>
  );
}
