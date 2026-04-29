import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type PresenceInfo = { online: boolean; lastActive: string | null };
type PresenceMap = Record<string, PresenceInfo>;

const PresenceContext = createContext<PresenceMap>({});

/**
 * Global presence tracker. Mount once near the root, inside AuthProvider.
 * As soon as a user is authenticated, they're marked online in the
 * `dm_presence` realtime channel — no need to open the chat panel.
 */
export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [presence, setPresence] = useState<PresenceMap>({});

  useEffect(() => {
    if (!user) {
      setPresence({});
      return;
    }

    const ch = supabase.channel("dm_presence", {
      config: { presence: { key: user.id } },
    });

    const recompute = () => {
      const state = ch.presenceState() as Record<string, Array<{ online_at?: string }>>;
      setPresence((prev) => {
        const next: PresenceMap = {};
        for (const uid of Object.keys(state)) {
          const metas = state[uid] ?? [];
          const latest =
            metas.map((m) => m.online_at).filter(Boolean).sort().pop() ??
            new Date().toISOString();
          next[uid] = { online: true, lastActive: latest };
        }
        for (const [uid, info] of Object.entries(prev)) {
          if (!next[uid]) {
            next[uid] = {
              online: false,
              lastActive: info.lastActive ?? new Date().toISOString(),
            };
          }
        }
        return next;
      });
    };

    ch.on("presence", { event: "sync" }, recompute);
    ch.on("presence", { event: "join" }, recompute);
    ch.on("presence", { event: "leave" }, recompute);

    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await ch.track({ online_at: new Date().toISOString() });
      }
    });

    const heartbeat = setInterval(() => {
      if (document.visibilityState === "visible") {
        void ch.track({ online_at: new Date().toISOString() });
      }
    }, 30000);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void ch.track({ online_at: new Date().toISOString() });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onVisibility);
      void supabase.removeChannel(ch);
    };
  }, [user?.id]);

  return <PresenceContext.Provider value={presence}>{children}</PresenceContext.Provider>;
}

export function usePresence(): PresenceMap {
  return useContext(PresenceContext);
}
