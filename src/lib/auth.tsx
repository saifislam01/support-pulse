import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Role = "admin" | "manager" | "support_engineer";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  role: Role | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let requestId = 0;

    const fetchRole = async (userId: string): Promise<Role> => {
      // Single round-trip: fetch all roles for the user at once, then pick highest priority.
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      if (error) {
        console.error("Error fetching role:", error);
        return "support_engineer";
      }

      const roles = (data?.map((r) => r.role as Role)) ?? [];
      return roles.includes("admin")
        ? "admin"
        : roles.includes("manager")
          ? "manager"
          : "support_engineer";
    };

    const applySession = async (sess: Session | null) => {
      const currentRequest = ++requestId;
      setSession(sess);
      setUser(sess?.user ?? null);

      if (!sess?.user) {
        setRole(null);
        setLoading(false);
        return;
      }

      // Don't block UI rendering on the role fetch — set loading false
      // as soon as we know the user is signed in. Role resolves shortly after.
      const resolvedRole = await fetchRole(sess.user.id);
      if (!active || currentRequest !== requestId) return;
      setRole(resolvedRole);
      setLoading(false);
    };

    let initialized = false;

    // Set up listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      // Skip the initial INITIAL_SESSION event — getSession() below handles it,
      // and running both causes duplicate role queries on every page load.
      if (!initialized) return;
      setTimeout(() => {
        void applySession(sess);
      }, 0);
    });

    // THEN check existing session
    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      initialized = true;
      void applySession(sess);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? { error: error.message } : {};
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { display_name: displayName },
      },
    });
    return error ? { error: error.message } : {};
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, role, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
