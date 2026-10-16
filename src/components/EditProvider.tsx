import { useState, type ReactNode } from "react";
import { getMyRole } from "@/lib/account";
import { useSession } from "@/lib/auth";
import { EditContext } from "@/lib/edit";
import { useAsync } from "@/lib/hooks";

// This wraps the whole site, outside any error boundary, so a failed role check means "not an
// admin" rather than an error.
const roleOrNone = (userId: string) => getMyRole(userId).catch(() => null);

function AdminEdit({ userId, children }: { userId: string; children: ReactNode }) {
  const me = useAsync(roleOrNone, userId);
  const [on, setOn] = useState(false);
  const canEdit = me?.role === "admin";
  return <EditContext value={{ canEdit, editing: canEdit && on, setEditing: setOn }}>{children}</EditContext>;
}

export default function EditProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  if (!session) return <>{children}</>;
  return (
    <AdminEdit key={session.user.id} userId={session.user.id}>
      {children}
    </AdminEdit>
  );
}
