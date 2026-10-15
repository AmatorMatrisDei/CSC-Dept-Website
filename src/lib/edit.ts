import { createContext, useContext } from "react";

// Whether the signed-in person is an admin who has switched Edit mode on. Sign-in itself lives in
// auth.ts; the database's own rules still decide what any save may do.
export type EditState = {
  canEdit: boolean; // signed in as an admin
  editing: boolean; // canEdit and the Edit mode switch is on
  setEditing: (value: boolean) => void;
};

export const EditContext = createContext<EditState>({ canEdit: false, editing: false, setEditing: () => {} });

export function useEdit() {
  return useContext(EditContext);
}
