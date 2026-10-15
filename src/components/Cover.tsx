// Every cover image sits in one fixed 16:9 frame and is cropped to fit, so layouts never jump.
// Without an image, a plain tinted block keeps the frame.
export default function Cover({
  src,
  alt,
  className = "",
}: {
  src: string | null;
  alt: string;
  className?: string;
}) {
  return (
    <div className={`aspect-video overflow-hidden bg-surface ${className}`}>
      {src && (
        // Plain <img>: next/image needs extra Cloudflare configuration owned by the back end team.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      )}
    </div>
  );
}
