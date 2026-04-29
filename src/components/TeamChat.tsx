import { useEffect, useMemo, useRef, useState } from "react";
import { MessagesSquare, Send, X, Shield, Briefcase, Headphones, ArrowLeft, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type Role } from "@/lib/auth";
import { usePresence } from "@/lib/presence";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type DM = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

type Teammate = {
  id: string;
  display_name: string;
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
  const [teammates, setTeammates] = useState<Teammate[]>([]);
  const [activePeerId, setActivePeerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DM[]>([]);
  const [allDMs, setAllDMs] = useState<DM[]>([]); // for unread + last-message previews
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [peerTyping, setPeerTyping] = useState(false);
  const presence = usePresence();
  const scrollRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  const activePeerRef = useRef(activePeerId);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef(0);
  openRef.current = open;
  activePeerRef.current = activePeerId;

  // Load teammates list
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [{ data: profs }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id,display_name").neq("id", user.id),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      if (cancelled) return;
      const list: Teammate[] = (profs ?? []).map((p) => {
        const userRoles = roles?.filter((r) => r.user_id === p.id).map((r) => r.role as Role) ?? [];
        const r: Role | null = userRoles.includes("admin")
          ? "admin"
          : userRoles.includes("manager")
            ? "manager"
            : userRoles.includes("support_engineer")
              ? "support_engineer"
              : null;
        return { id: p.id, display_name: p.display_name ?? "Teammate", role: r };
      });
      setTeammates(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Load ALL DMs involving me (for inbox previews + unread badge) + realtime
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("direct_messages")
        .select("id,sender_id,recipient_id,body,read_at,created_at")
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order("created_at", { ascending: true })
        .limit(500);
      if (cancelled) return;
      if (error) {
        console.error("Failed to load DMs", error);
        return;
      }
      setAllDMs(data ?? []);
    })();

    const channel = supabase
      .channel(`dm_user_${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages", filter: `recipient_id=eq.${user.id}` },
        (payload) => {
          const m = payload.new as DM;
          setAllDMs((p) => (p.some((x) => x.id === m.id) ? p : [...p, m]));
          if (!openRef.current || activePeerRef.current !== m.sender_id) {
            const sender = teammates.find((t) => t.id === m.sender_id)?.display_name ?? "Teammate";
            toast.message(`New message from ${sender}`, { description: m.body.slice(0, 80) });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages", filter: `sender_id=eq.${user.id}` },
        (payload) => {
          const m = payload.new as DM;
          setAllDMs((p) => (p.some((x) => x.id === m.id) ? p : [...p, m]));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "direct_messages" },
        (payload) => {
          const m = payload.new as DM;
          setAllDMs((p) => p.map((x) => (x.id === m.id ? m : x)));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "direct_messages" },
        (payload) => {
          const old = payload.old as { id: string };
          setAllDMs((p) => p.filter((x) => x.id !== old.id));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, teammates.length]);

  // Filter conversation messages from allDMs based on active peer
  useEffect(() => {
    if (!user || !activePeerId) {
      setMessages([]);
      return;
    }
    const conv = allDMs
      .filter(
        (m) =>
          (m.sender_id === user.id && m.recipient_id === activePeerId) ||
          (m.sender_id === activePeerId && m.recipient_id === user.id),
      )
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    setMessages(conv);
  }, [allDMs, activePeerId, user?.id]);

  // Mark unread messages from active peer as read
  useEffect(() => {
    if (!user || !activePeerId || !open) return;
    const unreadIds = allDMs
      .filter((m) => m.sender_id === activePeerId && m.recipient_id === user.id && !m.read_at)
      .map((m) => m.id);
    if (unreadIds.length === 0) return;
    void supabase
      .from("direct_messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", unreadIds);
  }, [allDMs, activePeerId, open, user?.id]);

  // Per-conversation typing channel (broadcast)
  useEffect(() => {
    if (!user || !activePeerId) {
      setPeerTyping(false);
      return;
    }
    const room = `dm_typing_${[user.id, activePeerId].sort().join("_")}`;
    const ch = supabase.channel(room, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "typing" }, (payload) => {
      const from = (payload.payload as { from?: string } | undefined)?.from;
      if (from && from === activePeerRef.current) {
        setPeerTyping(true);
        if (typingClearTimerRef.current) clearTimeout(typingClearTimerRef.current);
        typingClearTimerRef.current = setTimeout(() => setPeerTyping(false), 3000);
      }
    });
    ch.on("broadcast", { event: "stop_typing" }, (payload) => {
      const from = (payload.payload as { from?: string } | undefined)?.from;
      if (from && from === activePeerRef.current) {
        if (typingClearTimerRef.current) clearTimeout(typingClearTimerRef.current);
        setPeerTyping(false);
      }
    });
    ch.subscribe();
    typingChannelRef.current = ch;
    return () => {
      typingChannelRef.current = null;
      if (typingClearTimerRef.current) clearTimeout(typingClearTimerRef.current);
      setPeerTyping(false);
      void supabase.removeChannel(ch);
    };
  }, [user?.id, activePeerId]);

  // Global presence channel — tracks who is online + last active
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("dm_presence", {
      config: { presence: { key: user.id } },
    });

    const recompute = () => {
      const state = ch.presenceState() as Record<string, Array<{ online_at?: string }>>;
      setPresence((prev) => {
        const next: Record<string, { online: boolean; lastActive: string | null }> = {};
        // Mark currently-present users as online
        for (const uid of Object.keys(state)) {
          const metas = state[uid] ?? [];
          const latest = metas
            .map((m) => m.online_at)
            .filter(Boolean)
            .sort()
            .pop() ?? new Date().toISOString();
          next[uid] = { online: true, lastActive: latest };
        }
        // Carry over previous lastActive for users no longer online
        for (const [uid, info] of Object.entries(prev)) {
          if (!next[uid]) {
            next[uid] = { online: false, lastActive: info.lastActive ?? new Date().toISOString() };
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

    // Heartbeat every 30s while tab is visible to refresh online_at
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

  // Auto-scroll
  useEffect(() => {
    if (open && activePeerId && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open, activePeerId, peerTyping]);

  const totalUnread = useMemo(() => {
    if (!user) return 0;
    return allDMs.filter((m) => m.recipient_id === user.id && !m.read_at).length;
  }, [allDMs, user?.id]);

  const conversations = useMemo(() => {
    if (!user) return [];
    // Build per-peer summary: last message + unread count
    const map = new Map<string, { lastMsg: DM; unread: number }>();
    for (const m of allDMs) {
      const peerId = m.sender_id === user.id ? m.recipient_id : m.sender_id;
      const cur = map.get(peerId);
      const isUnread = m.recipient_id === user.id && !m.read_at;
      if (!cur || cur.lastMsg.created_at < m.created_at) {
        map.set(peerId, { lastMsg: m, unread: (cur?.unread ?? 0) + (isUnread ? 1 : 0) });
      } else if (isUnread) {
        map.set(peerId, { ...cur, unread: cur.unread + 1 });
      }
    }
    const filtered = teammates.filter((t) =>
      t.display_name.toLowerCase().includes(search.toLowerCase()),
    );
    return filtered
      .map((t) => ({ teammate: t, summary: map.get(t.id) }))
      .sort((a, b) => {
        const at = a.summary?.lastMsg.created_at ?? "";
        const bt = b.summary?.lastMsg.created_at ?? "";
        return bt.localeCompare(at);
      });
  }, [allDMs, teammates, user?.id, search]);

  const sendTyping = (event: "typing" | "stop_typing") => {
    const ch = typingChannelRef.current;
    if (!ch || !user) return;
    void ch.send({ type: "broadcast", event, payload: { from: user.id } });
  };

  const handleInputChange = (value: string) => {
    setInput(value);
    if (!value.trim()) {
      sendTyping("stop_typing");
      lastTypingSentRef.current = 0;
      return;
    }
    const now = Date.now();
    // Throttle to one typing broadcast per ~1.5s
    if (now - lastTypingSentRef.current > 1500) {
      sendTyping("typing");
      lastTypingSentRef.current = now;
    }
  };

  const handleSend = async () => {
    const body = input.trim();
    if (!body || !user || !activePeerId) return;
    setInput("");
    sendTyping("stop_typing");
    lastTypingSentRef.current = 0;
    const { error } = await supabase
      .from("direct_messages")
      .insert({ sender_id: user.id, recipient_id: activePeerId, body });
    if (error) {
      toast.error("Failed to send");
      setInput(body);
    }
  };

  const myInitials = useMemo(() => {
    const name = user?.user_metadata?.display_name ?? user?.email ?? "U";
    return name.split(/[\s@]/)[0].slice(0, 2).toUpperCase();
  }, [user]);

  const activePeer = activePeerId ? teammates.find((t) => t.id === activePeerId) : null;

  const formatLastActive = (iso: string | null): string => {
    if (!iso) return "Offline";
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "Active just now";
    if (mins < 60) return `Active ${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `Active ${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `Active ${days}d ago`;
    return `Active ${new Date(iso).toLocaleDateString()}`;
  };

  if (!user || !role) return null;

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "fixed bottom-24 md:bottom-6 right-6 z-40 size-14 rounded-full gradient-rank shadow-glow flex items-center justify-center text-primary-foreground press transition-transform",
          open && "scale-90",
        )}
        aria-label="Direct messages"
      >
        <MessagesSquare className="size-6" />
        {totalUnread > 0 && !open && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center border-2 border-background">
            {totalUnread > 9 ? "9+" : totalUnread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed bottom-44 md:bottom-24 right-6 z-40 w-[min(380px,calc(100vw-3rem))] h-[min(560px,calc(100vh-12rem))] glass rounded-2xl shadow-glow flex flex-col overflow-hidden animate-[slide-up_0.3s_cubic-bezier(0.16,1,0.3,1)]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border gradient-hero">
            <div className="flex items-center gap-2 min-w-0">
              {activePeer && (
                <Button variant="ghost" size="icon" className="h-7 w-7 -ml-1" onClick={() => setActivePeerId(null)}>
                  <ArrowLeft className="size-4" />
                </Button>
              )}
              <div className="min-w-0">
                <div className="font-display font-bold text-sm truncate flex items-center gap-1.5">
                  {activePeer ? activePeer.display_name : "Direct messages"}
                  {activePeer && presence[activePeer.id]?.online && (
                    <span className="size-2 rounded-full bg-emerald-500 ring-2 ring-background shadow-[0_0_8px_rgb(16_185_129_/_0.6)]" />
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {activePeer
                    ? presence[activePeer.id]?.online
                      ? `Online${peerTyping ? " · typing…" : ""}`
                      : formatLastActive(presence[activePeer.id]?.lastActive ?? null)
                    : "Private 1:1 chats"}
                </div>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="h-8 w-8">
              <X className="size-4" />
            </Button>
          </div>

          {/* Conversation list */}
          {!activePeer && (
            <>
              <div className="p-3 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    placeholder="Search teammates…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-9"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {conversations.length === 0 && (
                  <div className="text-center text-xs text-muted-foreground py-8 px-4">
                    No teammates found.
                  </div>
                )}
                {conversations.map(({ teammate, summary }) => {
                  const meta = teammate.role ? roleMeta[teammate.role] : null;
                  const initials = teammate.display_name.slice(0, 2).toUpperCase();
                  const last = summary?.lastMsg;
                  const lastFromMe = last?.sender_id === user.id;
                  const pres = presence[teammate.id];
                  const isOnline = !!pres?.online;
                  return (
                    <button
                      key={teammate.id}
                      onClick={() => setActivePeerId(teammate.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-sidebar-accent transition-colors text-left border-b border-border/50"
                    >
                      <div className="relative shrink-0">
                        <Avatar className="size-9">
                          <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <span
                          className={cn(
                            "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-background",
                            isOnline ? "bg-emerald-500 shadow-[0_0_6px_rgb(16_185_129_/_0.7)]" : "bg-muted-foreground/40",
                          )}
                          title={isOnline ? "Online" : formatLastActive(pres?.lastActive ?? null)}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium truncate">{teammate.display_name}</span>
                          {meta && (
                            <span className={cn("flex items-center gap-0.5 text-[10px] shrink-0", meta.color)}>
                              <meta.Icon className="size-2.5" />
                              {meta.label}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {last
                            ? `${lastFromMe ? "You: " : ""}${last.body}`
                            : isOnline
                              ? "Online · say hi"
                              : formatLastActive(pres?.lastActive ?? null)}
                        </div>
                      </div>
                      {summary && summary.unread > 0 && (
                        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center shrink-0">
                          {summary.unread > 9 ? "9+" : summary.unread}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Active conversation */}
          {activePeer && (
            <>
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
                {messages.length === 0 && (
                  <div className="text-center text-xs text-muted-foreground py-8">
                    No messages yet. Say hi 👋
                  </div>
                )}
                {messages.map((m) => {
                  const mine = m.sender_id === user.id;
                  const initials = (mine ? myInitials : activePeer.display_name.slice(0, 2)).toUpperCase();
                  return (
                    <div key={m.id} className={cn("flex gap-2", mine ? "flex-row-reverse" : "flex-row")}>
                      <Avatar className="size-7 shrink-0">
                        <AvatarFallback className="bg-primary/15 text-primary text-[10px] font-semibold">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className={cn("max-w-[75%] flex flex-col", mine ? "items-end" : "items-start")}>
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
                          {mine && m.read_at && " · Read"}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {peerTyping && (
                  <div className="flex gap-2 items-end animate-[fade-in_0.2s_ease-out]">
                    <Avatar className="size-7 shrink-0">
                      <AvatarFallback className="bg-primary/15 text-primary text-[10px] font-semibold">
                        {activePeer.display_name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-3 py-2 shadow-card flex items-center gap-1">
                      <span className="size-1.5 rounded-full bg-muted-foreground/70 animate-[bounce_1.2s_ease-in-out_infinite]" />
                      <span className="size-1.5 rounded-full bg-muted-foreground/70 animate-[bounce_1.2s_ease-in-out_0.15s_infinite]" />
                      <span className="size-1.5 rounded-full bg-muted-foreground/70 animate-[bounce_1.2s_ease-in-out_0.3s_infinite]" />
                      <span className="ml-1.5 text-[10px] text-muted-foreground">typing…</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-3 border-t border-border bg-background/50 flex items-center gap-2">
                <Input
                  value={input}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onBlur={() => sendTyping("stop_typing")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  placeholder={`Message ${activePeer.display_name}…`}
                  className="flex-1"
                  maxLength={1000}
                />
                <Button size="icon" onClick={() => void handleSend()} disabled={!input.trim()} className="press">
                  <Send className="size-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
