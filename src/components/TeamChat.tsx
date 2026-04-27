import { useEffect, useMemo, useRef, useState } from "react";
import { MessagesSquare, Send, X, Shield, Briefcase, Headphones } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type Role } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Message = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
};

type ProfileInfo = {
  display_name: string | null;
  role: Role | null;
};

const roleMeta: Record<Role, { label: string; Icon: typeof Shield; color: string }> = {
  admin: { label: "Admin", Icon: Shield, color: "text-primary" },
  manager: { label: "Manager", Icon: Briefcase, color: "text-accent" },
  support_engineer: { label: "Engineer", Icon: Headphones, color: "text-muted-foreground" },
};

export function TeamChat() {
  const { user, role } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileInfo>>({});
  const [input, setInput] = useState("");
  const [unread, setUnread] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  // Load history + subscribe to realtime
  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    const loadHistory = async () => {
      const { data, error } = await supabase
        .from("team_messages")
        .select("id,user_id,body,created_at")
        .order("created_at", { ascending: true })
        .limit(200);
      if (cancelled) return;
      if (error) {
        console.error("Failed to load chat history", error);
        return;
      }
      setMessages(data ?? []);
      await hydrateProfiles((data ?? []).map((m) => m.user_id));
    };

    void loadHistory();

    const channel = supabase
      .channel("team_messages_room")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "team_messages" },
        (payload) => {
          const msg = payload.new as Message;
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
          void hydrateProfiles([msg.user_id]);
          if (!openRef.current && msg.user_id !== user.id) {
            setUnread((u) => u + 1);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "team_messages" },
        (payload) => {
          const old = payload.old as { id: string };
          setMessages((prev) => prev.filter((m) => m.id !== old.id));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Auto-scroll on new messages when open
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  // Reset unread when opened
  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  const hydrateProfiles = async (userIds: string[]) => {
    const unique = Array.from(new Set(userIds)).filter((id) => !profiles[id]);
    if (unique.length === 0) return;

    const [{ data: profs }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("id,display_name").in("id", unique),
      supabase.from("user_roles").select("user_id,role").in("user_id", unique),
    ]);

    const next: Record<string, ProfileInfo> = {};
    unique.forEach((id) => {
      const p = profs?.find((pr) => pr.id === id);
      const userRoles = roles?.filter((r) => r.user_id === id).map((r) => r.role as Role) ?? [];
      const r: Role | null = userRoles.includes("admin")
        ? "admin"
        : userRoles.includes("manager")
          ? "manager"
          : userRoles.includes("support_engineer")
            ? "support_engineer"
            : null;
      next[id] = { display_name: p?.display_name ?? null, role: r };
    });
    setProfiles((prev) => ({ ...prev, ...next }));
  };

  const handleSend = async () => {
    const body = input.trim();
    if (!body || !user) return;
    setInput("");
    const { error } = await supabase
      .from("team_messages")
      .insert({ user_id: user.id, body });
    if (error) {
      toast.error("Failed to send message");
      setInput(body);
    }
  };

  const myInitials = useMemo(() => {
    const name = user?.user_metadata?.display_name ?? user?.email ?? "U";
    return name.split(/[\s@]/)[0].slice(0, 2).toUpperCase();
  }, [user]);

  if (!user || !role) return null;

  return (
    <>
      {/* Floating launcher */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "fixed bottom-24 md:bottom-6 right-6 z-40 size-14 rounded-full gradient-rank shadow-glow flex items-center justify-center text-primary-foreground press transition-transform",
          open && "scale-90",
        )}
        aria-label="Team chat"
      >
        <MessagesSquare className="size-6" />
        {unread > 0 && !open && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center border-2 border-background">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-44 md:bottom-24 right-6 z-40 w-[min(380px,calc(100vw-3rem))] h-[min(560px,calc(100vh-12rem))] glass rounded-2xl shadow-glow flex flex-col overflow-hidden animate-[slide-up_0.3s_cubic-bezier(0.16,1,0.3,1)]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border gradient-hero">
            <div>
              <div className="font-display font-bold text-sm">Team chat</div>
              <div className="text-xs text-muted-foreground">Admins · Managers · Engineers</div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="h-8 w-8">
              <X className="size-4" />
            </Button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-xs text-muted-foreground py-8">
                No messages yet. Say hi to your team 👋
              </div>
            )}
            {messages.map((m) => {
              const mine = m.user_id === user.id;
              const profile = profiles[m.user_id];
              const r = profile?.role;
              const meta = r ? roleMeta[r] : null;
              const name = profile?.display_name ?? "Teammate";
              const initials = name.slice(0, 2).toUpperCase();
              return (
                <div
                  key={m.id}
                  className={cn("flex gap-2", mine ? "flex-row-reverse" : "flex-row")}
                >
                  <Avatar className="size-7 shrink-0">
                    <AvatarFallback className="bg-primary/15 text-primary text-[10px] font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className={cn("max-w-[75%] flex flex-col", mine ? "items-end" : "items-start")}>
                    <div className="flex items-center gap-1.5 mb-0.5 px-1">
                      <span className="text-[11px] font-medium">{mine ? "You" : name}</span>
                      {meta && (
                        <span className={cn("flex items-center gap-0.5 text-[10px]", meta.color)}>
                          <meta.Icon className="size-2.5" />
                          {meta.label}
                        </span>
                      )}
                    </div>
                    <div
                      className={cn(
                        "rounded-2xl px-3 py-2 text-sm break-words shadow-card",
                        mine
                          ? "gradient-rank text-primary-foreground rounded-br-sm"
                          : "bg-card border border-border rounded-bl-sm",
                      )}
                    >
                      {m.body}
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-0.5 px-1">
                      {new Date(m.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Composer */}
          <div className="p-3 border-t border-border bg-background/50 flex items-center gap-2">
            <Avatar className="size-8 shrink-0">
              <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                {myInitials}
              </AvatarFallback>
            </Avatar>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="Type a message…"
              className="flex-1"
              maxLength={1000}
            />
            <Button size="icon" onClick={() => void handleSend()} disabled={!input.trim()} className="press">
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
