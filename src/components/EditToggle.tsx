import { useEdit } from "@/lib/edit";

// Edit mode switch in the header. Only admins see it.
export default function EditToggle() {
  const { canEdit, editing, setEditing } = useEdit();
  if (!canEdit) return null;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={editing}
      onClick={() => setEditing(!editing)}
      className="inline-flex min-h-11 items-center gap-2 rounded px-3 text-sm hover:bg-current/10"
    >
      <span aria-hidden="true" className={`inline-block h-5 w-9 rounded-full p-0.5 ${editing ? "bg-accent" : "bg-border"}`}>
        <span className={`block size-4 rounded-full bg-white transition-transform motion-reduce:transition-none ${editing ? "translate-x-4" : ""}`} />
      </span>
      Edit mode
    </button>
  );
}
