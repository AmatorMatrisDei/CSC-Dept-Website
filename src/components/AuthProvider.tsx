import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { AuthContext, type Role } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!supabase);
  const [user, setUser] = useState<{ id: string; email: string | null } | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email ?? null } : null);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Look up the role of whoever is signed in. Only admins get edit controls.
  useEffect(() => {
    let current = true;
    async function load() {
      if (!supabase || !user) {
        if (current) setRole(null);
        return;
      }
      const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (current) setRole((data?.role as Role | undefined) ?? "student");
    }
    void load();
    return () => {
      current = false;
    };
  }, [user]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return "Sign-in is not available.";
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? "That email and password did not work." : null;
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    if (!supabase) return { error: "Sign-up is not available.", needsConfirmation: false };
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name }, emailRedirectTo: `${window.location.origin}/account` },
    });
    if (error) return { error: error.message, needsConfirmation: false };
    return { error: null, needsConfirmation: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    setEditing(false);
    await supabase?.auth.signOut();
  }, []);

  const value = useMemo(() => {
    const isAdmin = role === "admin";
    return {
      ready,
      userId: user?.id ?? null,
      email: user?.email ?? null,
      role,
      isAdmin,
      isReviewer: isAdmin || role === "reviewer",
      editing: isAdmin && editing,
      setEditing,
      signIn,
      signUp,
      signOut,
    };
  }, [ready, user, role, editing, signIn, signUp, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
