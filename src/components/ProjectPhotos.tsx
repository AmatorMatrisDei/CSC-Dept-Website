import { useId, useRef, useState } from "react";
import { ACCEPT_PHOTOS, fieldClass, secondaryButtonClass } from "@/components/Form";
import {
  addGalleryPhoto,
  changeGalleryPhoto,
  removeCoverPhoto,
  removeGalleryPhoto,
  reorderGallery,
  setCoverPhoto,
} from "@/lib/projectPhotos";
import type { ProjectView } from "@/lib/types";

// Edit mode only: change a project's cover photo and gallery. Changes are saved as a draft and go
// live when the editor publishes. `project` is the project with the draft applied, `live` is as published.
const MAX_GALLERY = 20;

function PickPhoto({ label, disabled, onPick }: { label: string; disabled: boolean; onPick: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={secondaryButtonClass} disabled={disabled} onClick={() => input.current?.click()}>
        {label}
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT_PHOTOS}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onPick(file);
        }}
      />
    </>
  );
}

function GalleryFields({
  index,
  alt,
  caption,
  onSave,
}: {
  index: number;
  alt: string;
  caption: string;
  onSave: (patch: { alt_text?: string; caption?: string }) => void;
}) {
  const [draft, setDraft] = useState({ alt, caption });
  return (
    <div className="flex flex-col gap-2">
      <input
        aria-label={`Photo ${index + 1}: description for screen readers`}
        className={fieldClass}
        value={draft.alt}
        maxLength={300}
        onChange={(e) => setDraft({ ...draft, alt: e.target.value })}
        onBlur={() => draft.alt !== alt && onSave({ alt_text: draft.alt })}
      />
      <input
        aria-label={`Photo ${index + 1}: caption (optional)`}
        placeholder="Caption (optional)"
        className={fieldClass}
        value={draft.caption}
        maxLength={300}
        onChange={(e) => setDraft({ ...draft, caption: e.target.value })}
        onBlur={() => draft.caption !== caption && onSave({ caption: draft.caption })}
      />
    </div>
  );
}

export default function ProjectPhotos({ project, live }: { project: ProjectView; live: ProjectView }) {
  const headingId = useId();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [coverAlt, setCoverAlt] = useState(project.thumbnail?.alt || project.title);

  async function run(work: () => Promise<string | null>) {
    setBusy(true);
    setMessage(null);
    const error = await work();
    setBusy(false);
    setMessage(error);
  }

  const move = (from: number, to: number) => {
    const next = [...project.image_paths];
    next.splice(to, 0, next.splice(from, 1)[0]);
    void run(() => reorderGallery(project, live, next));
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-5 rounded border border-dashed border-accent/60 p-4">
      <h2 id={headingId} className="text-xl font-semibold">
        Photos
      </h2>

      <div className="flex flex-col gap-2">
        <h3 className="font-medium">Cover photo</h3>
        <p className="text-sm text-muted">Shown on project cards and the home page carousel.</p>
        {project.thumbnail && (
          <img
            src={project.thumbnail.url}
            alt={project.thumbnail.alt}
            className="aspect-[3/2] w-full max-w-xs rounded border border-border object-cover"
          />
        )}
        <label className="flex flex-col gap-1">
          <span className="text-sm">Description for screen readers</span>
          <input className={fieldClass} value={coverAlt} maxLength={300} onChange={(e) => setCoverAlt(e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          <PickPhoto
            label={project.thumbnail ? "Replace cover photo" : "Add a cover photo"}
            disabled={busy || coverAlt.trim() === ""}
            onPick={(file) => void run(() => setCoverPhoto(project, live, file, coverAlt.trim()))}
          />
          {project.thumbnail && (
            <button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => void run(() => removeCoverPhoto(project, live))}>
              Remove cover photo
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="font-medium">Gallery</h3>
        <ol className="flex flex-col gap-4">
          {project.images.map((image, i) => {
            const path = project.image_paths[i];
            return (
              <li key={path} className="flex flex-col gap-3 sm:flex-row">
                <img src={image.url} alt={image.alt} className="aspect-[3/2] w-full max-w-48 rounded border border-border object-cover" />
                <div className="flex flex-1 flex-col gap-2">
                  <GalleryFields
                    index={i}
                    alt={image.alt}
                    caption={image.caption ?? ""}
                    onSave={(patch) => void run(() => changeGalleryPhoto(project, live, path, patch))}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={secondaryButtonClass} disabled={busy || i === 0} aria-label={`Move photo ${i + 1} up`} onClick={() => move(i, i - 1)}>
                      Move up
                    </button>
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      disabled={busy || i === project.images.length - 1}
                      aria-label={`Move photo ${i + 1} down`}
                      onClick={() => move(i, i + 1)}
                    >
                      Move down
                    </button>
                    <button type="button" className={secondaryButtonClass} disabled={busy} aria-label={`Remove photo ${i + 1}`} onClick={() => void run(() => removeGalleryPhoto(project, live, path))}>
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap items-center gap-3">
          <PickPhoto
            label="Add a photo"
            disabled={busy || project.images.length >= MAX_GALLERY}
            onPick={(file) => void run(() => addGalleryPhoto(project, live, file, `Photo of ${project.title}`))}
          />
          <span role="status" className="text-sm">
            {busy ? "Saving…" : message}
          </span>
        </div>
        <p className="text-sm text-muted">New photos start with a generic description. Edit it so it says what the photo shows.</p>
      </div>
    </section>
  );
}
