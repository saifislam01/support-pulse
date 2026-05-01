import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CalendarDays,
  Loader2,
  RefreshCw,
  Link2Off,
  ExternalLink,
  Bell,
  Sparkles,
  Clock,
  MapPin,
  Video,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, isToday, differenceInMinutes } from "date-fns";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calendar")({
  component: () => (
    <RequireAuth>
      <AppShell>
        <CalendarPage />
      </AppShell>
    </RequireAuth>
  ),
  head: () => ({ meta: [{ title: "Calendar — Support Performance Tracker" }] }),
});

type CalEvent = {
  id: string;
  summary: string;
  description: string | null;
  location: string | null;
  start: string | null;
  end: string | null;
  allDay: boolean;
  htmlLink: string | null;
  hangoutLink: string | null;
};

const CLIENT_ID_ENV = "GOOGLE_OAUTH_CLIENT_ID"; // server-side only
const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

function buildAuthUrl(clientId: string, redirectUri: string) {
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

function CalendarPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  const [cursor, setCursor] = useState(() => new Date());
  const seenRef = useRef<Set<string>>(new Set());

  const loadEvents = async () => {
    if (!user) return;
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return;
    const res = await fetch("/api/google/events", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      toast.error("Could not load calendar");
      return;
    }
    const j = (await res.json()) as { connected: boolean; email?: string; events: CalEvent[] };
    setConnected(j.connected);
    setEmail(j.email ?? null);
    setEvents(j.events ?? []);
  };

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await loadEvents();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Auto-refresh events every 5 minutes so calendar stays in sync.
  useEffect(() => {
    if (!connected) return;
    const id = setInterval(() => void loadEvents(), 5 * 60 * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  // Load already-notified event IDs from DB so reminders dedupe across sessions.
  useEffect(() => {
    if (!user) return;
    void (async () => {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data } = await supabase
        .from("calendar_reminders_seen")
        .select("event_id, event_start")
        .eq("user_id", user.id)
        .gte("event_start", since);
      const set = new Set<string>();
      for (const r of data ?? []) set.add(`${r.event_id}|${r.event_start}`);
      seenRef.current = set;
    })();
  }, [user?.id]);

  // Reminder engine: every 30s check for events starting in ~10 minutes.
  useEffect(() => {
    if (!user || !connected) return;
    const tick = async () => {
      const now = Date.now();
      for (const ev of events) {
        if (!ev.start || ev.allDay) continue;
        const startMs = new Date(ev.start).getTime();
        const minsUntil = (startMs - now) / 60000;
        // Fire when between 10:00 and 9:00 minutes before start
        if (minsUntil <= 10 && minsUntil > 9) {
          const key = `${ev.id}|${ev.start}`;
          if (seenRef.current.has(key)) continue;
          seenRef.current.add(key);
          fireReminder(ev);
          // persist
          await supabase
            .from("calendar_reminders_seen")
            .insert({ user_id: user.id, event_id: ev.id, event_start: ev.start })
            .then(() => undefined, () => undefined);
        }
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 30_000);
    return () => clearInterval(id);
  }, [events, user, connected]);

  const handleConnect = async () => {
    // Get client ID from a one-shot server endpoint trick: use env injected at build is no good for secrets.
    // Instead the OAuth client ID is provided to the browser at runtime via fetch.
    const res = await fetch("/api/google/client-id");
    if (!res.ok) {
      toast.error("Google OAuth not configured");
      return;
    }
    const { clientId } = (await res.json()) as { clientId: string };
    const redirect = `${window.location.origin}/auth/google/callback`;
    window.location.href = buildAuthUrl(clientId, redirect);
  };

  const handleDisconnect = async () => {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return;
    const res = await fetch("/api/google/events", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      toast.success("Disconnected from Google Calendar");
      setConnected(false);
      setEmail(null);
      setEvents([]);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadEvents();
    setRefreshing(false);
    toast.success("Calendar refreshed");
  };

  const requestNotificationPermission = async () => {
    if (typeof Notification === "undefined") {
      toast.error("This browser does not support notifications");
      return;
    }
    const p = await Notification.requestPermission();
    setPermission(p);
    if (p === "granted") toast.success("Notifications enabled");
  };

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor));
    const end = endOfWeek(endOfMonth(cursor));
    const days: Date[] = [];
    let d = start;
    while (d <= end) {
      days.push(d);
      d = addDays(d, 1);
    }
    return days;
  }, [cursor]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const ev of events) {
      if (!ev.start) continue;
      const key = format(new Date(ev.start), "yyyy-MM-dd");
      const arr = map.get(key) ?? [];
      arr.push(ev);
      map.set(key, arr);
    }
    return map;
  }, [events]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return events
      .filter((e) => e.start && new Date(e.start).getTime() >= now)
      .slice(0, 8);
  }, [events]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="space-y-8">
        <header>
          <h1 className="font-display text-3xl font-bold">Calendar</h1>
          <p className="text-muted-foreground mt-1">
            Sync your Google Calendar to see schedules and get a 10-minute reminder before every event.
          </p>
        </header>

        <Card className="p-10 text-center max-w-xl mx-auto">
          <div className="size-14 mx-auto rounded-2xl gradient-rank flex items-center justify-center shadow-glow mb-6">
            <CalendarDays className="size-7 text-primary-foreground" />
          </div>
          <h2 className="font-display text-2xl font-bold">Connect Google Calendar</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Sign in with your Gmail account to sync events. We'll play a soothing chime and notify you 10 minutes before each booking.
          </p>
          <Button onClick={handleConnect} className="mt-6 press shadow-glow">
            <Sparkles className="size-4 mr-2" />
            Connect with Google
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Calendar</h1>
          <p className="text-muted-foreground mt-1 flex items-center gap-2 text-sm">
            <Badge variant="secondary" className="gap-1">
              <CalendarDays className="size-3" />
              {email ?? "Google connected"}
            </Badge>
            <span>· Reminders 10 min before each event</span>
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {permission !== "granted" && (
            <Button variant="outline" size="sm" onClick={requestNotificationPermission}>
              <Bell className="size-4 mr-2" />
              Enable system notifications
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? <Loader2 className="size-4 mr-2 animate-spin" /> : <RefreshCw className="size-4 mr-2" />}
            Refresh
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDisconnect}>
            <Link2Off className="size-4 mr-2" />
            Disconnect
          </Button>
        </div>
      </header>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        {/* Month grid */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl font-semibold">{format(cursor, "MMMM yyyy")}</h2>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={() => setCursor((c) => subMonths(c, 1))}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())}>
                Today
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setCursor((c) => addMonths(c, 1))}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="bg-muted/40 p-2 text-xs font-medium text-muted-foreground text-center">
                {d}
              </div>
            ))}
            {monthDays.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayEvents = eventsByDay.get(key) ?? [];
              const inMonth = isSameMonth(day, cursor);
              return (
                <div
                  key={key}
                  className={cn(
                    "bg-card min-h-24 p-1.5 text-xs flex flex-col gap-0.5",
                    !inMonth && "opacity-40",
                    isToday(day) && "ring-2 ring-primary ring-inset"
                  )}
                >
                  <div className={cn("font-semibold", isToday(day) && "text-primary")}>
                    {format(day, "d")}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {dayEvents.slice(0, 3).map((ev) => (
                      <div
                        key={ev.id}
                        title={ev.summary}
                        className="truncate rounded px-1 py-0.5 bg-primary/10 text-primary text-[11px]"
                      >
                        {!ev.allDay && ev.start ? format(new Date(ev.start), "HH:mm") + " " : ""}
                        {ev.summary}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <div className="text-[10px] text-muted-foreground">+{dayEvents.length - 3} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Upcoming list */}
        <Card className="p-4 self-start">
          <h2 className="font-display text-lg font-semibold mb-3">Up next</h2>
          {upcoming.length === 0 && (
            <p className="text-sm text-muted-foreground">No upcoming events in the next 30 days.</p>
          )}
          <ul className="space-y-2">
            {upcoming.map((ev) => {
              const start = ev.start ? new Date(ev.start) : null;
              const minsUntil = start ? differenceInMinutes(start, new Date()) : null;
              return (
                <motion.li
                  key={ev.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg border border-border p-3 bg-card/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-sm">{ev.summary}</div>
                    {ev.htmlLink && (
                      <a href={ev.htmlLink} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary">
                        <ExternalLink className="size-3.5" />
                      </a>
                    )}
                  </div>
                  {start && (
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Clock className="size-3" />
                      {ev.allDay ? format(start, "EEE, MMM d") + " · all day" : format(start, "EEE, MMM d · HH:mm")}
                      {minsUntil != null && minsUntil < 60 && minsUntil >= 0 && (
                        <span className="ml-1 text-primary font-medium">in {minsUntil}m</span>
                      )}
                    </div>
                  )}
                  {ev.location && (
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <MapPin className="size-3" />
                      {ev.location}
                    </div>
                  )}
                  {ev.hangoutLink && (
                    <a
                      href={ev.hangoutLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary hover:underline mt-1 inline-flex items-center gap-1"
                    >
                      <Video className="size-3" />
                      Join meeting
                    </a>
                  )}
                </motion.li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function fireReminder(ev: CalEvent) {
  const title = "Event in 10 minutes";
  const body = ev.summary + (ev.start ? ` · ${format(new Date(ev.start), "HH:mm")}` : "");
  // Toast
  toast(title, {
    description: body,
    duration: 12000,
    icon: <Bell className="size-4 text-primary" />,
  });
  // System notification
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      const n = new Notification(title, {
        body,
        tag: `cal-${ev.id}`,
        silent: false,
      });
      n.onclick = () => {
        window.focus();
        if (ev.hangoutLink) window.open(ev.hangoutLink, "_blank");
        else if (ev.htmlLink) window.open(ev.htmlLink, "_blank");
      };
    }
  } catch {
    /* ignore */
  }
  // Soothing chime
  playSoothingChime();
}

function playSoothingChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = [
      { freq: 523.25, start: 0, duration: 2.4 },
      { freq: 659.25, start: 0.35, duration: 2.4 },
      { freq: 783.99, start: 0.7, duration: 2.6 },
      { freq: 1046.5, start: 1.05, duration: 2.6 },
    ];
    notes.forEach(({ freq, start, duration }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + start;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.2, t0 + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.1);
    });
    setTimeout(() => void ctx.close(), 5000);
  } catch (err) {
    console.warn("chime failed", err);
  }
}

// Reference unused export to silence linter on env name constant
void CLIENT_ID_ENV;
