import { createContext, useContext } from "react";

// Sign-in state for staff and students. Visitors never sign in. The role comes from the database
// (profiles.role), and the database's own rules still decide what any save may do.
export type Role = "student" | "reviewer" | "admin";

export type AuthState = {
  ready: boolean;
  userId: string | null;
  email: string | null;
  role: Role | null;
  isAdmin: boolean;
  isReviewer: boolean; // reviewers and admins
  editing: boolean;
  setEditing: (value: boolean) => void;
  signIn: (email: string, password: string) => Promise<string | null>;
  // Returns an error message, or null. `needsConfirmation` is true when a confirmation email was sent.
  signUp: (name: string, email: string, password: string) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthState>({
  ready: true,
  userId: null,
  email: null,
  role: null,
  isAdmin: false,
  isReviewer: false,
  editing: false,
  setEditing: () => {},
  signIn: async () => "Sign-in is not available.",
  signUp: async () => ({ error: "Sign-up is not available.", needsConfirmation: false }),
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}
