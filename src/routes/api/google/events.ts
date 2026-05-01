import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

async function refreshIfNeeded(
  supabase: ReturnType<typeof createClient<Database>>,
  userId: string
): Promise<{ access_token: string; google_email: string | null } | { error: string }> {
  const { data: row, error } = await supabase
    .from("user_google_tokens")
    .select("access_token, refresh_token, expires_at, google_email")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!row) return { error: "not_connected" };

  const expiresAt = new Date(row.expires_at).getTime();
  if (expiresAt - 60_000 > Date.now()) {
    return { access_token: row.access_token, google_email: row.google_email };
  }

  const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID!;
  const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET!;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: row.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    return { error: `refresh_failed: ${t}` };
  }
  const j = (await res.json()) as { access_token: string; expires_in: number };
  const newExpires = new Date(Date.now() + j.expires_in * 1000).toISOString();
  await supabase
    .from("user_google_tokens")
    .update({ access_token: j.access_token, expires_at: newExpires, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  return { access_token: j.access_token, google_email: row.google_email };
}

export const Route = createFileRoute("/api/google/events")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
        const token = auth.slice(7);

        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });
        const { data: claims, error: cErr } = await supabase.auth.getClaims(token);
        if (cErr || !claims?.claims?.sub) return new Response("Unauthorized", { status: 401 });
        const userId = claims.claims.sub;

        const refreshed = await refreshIfNeeded(supabase, userId);
        if ("error" in refreshed) {
          if (refreshed.error === "not_connected") {
            return Response.json({ connected: false, events: [] });
          }
          return new Response(refreshed.error, { status: 500 });
        }

        const url = new URL(request.url);
        const timeMin = url.searchParams.get("timeMin") ?? new Date().toISOString();
        const timeMax =
          url.searchParams.get("timeMax") ??
          new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

        const params = new URLSearchParams({
          timeMin,
          timeMax,
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: "100",
        });
        const gRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
          { headers: { Authorization: `Bearer ${refreshed.access_token}` } }
        );
        if (!gRes.ok) {
          const t = await gRes.text();
          return new Response(`Google API error: ${t}`, { status: 502 });
        }
        const gJson = (await gRes.json()) as {
          items: Array<{
            id: string;
            summary?: string;
            description?: string;
            location?: string;
            start: { dateTime?: string; date?: string };
            end: { dateTime?: string; date?: string };
            htmlLink?: string;
            hangoutLink?: string;
          }>;
        };

        const events = (gJson.items ?? []).map((ev) => ({
          id: ev.id,
          summary: ev.summary ?? "(No title)",
          description: ev.description ?? null,
          location: ev.location ?? null,
          start: ev.start.dateTime ?? ev.start.date ?? null,
          end: ev.end.dateTime ?? ev.end.date ?? null,
          allDay: !ev.start.dateTime,
          htmlLink: ev.htmlLink ?? null,
          hangoutLink: ev.hangoutLink ?? null,
        }));

        return Response.json({
          connected: true,
          email: refreshed.google_email,
          events,
        });
      },
      DELETE: async ({ request }) => {
        // Disconnect: revoke + delete tokens
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
        const token = auth.slice(7);
        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });
        const { data: claims, error: cErr } = await supabase.auth.getClaims(token);
        if (cErr || !claims?.claims?.sub) return new Response("Unauthorized", { status: 401 });
        const userId = claims.claims.sub;

        const { data: row } = await supabase
          .from("user_google_tokens")
          .select("refresh_token")
          .eq("user_id", userId)
          .maybeSingle();
        if (row?.refresh_token) {
          // best-effort revoke
          try {
            await fetch(`https://oauth2.googleapis.com/revoke?token=${row.refresh_token}`, {
              method: "POST",
            });
          } catch {
            /* ignore */
          }
        }
        await supabase.from("user_google_tokens").delete().eq("user_id", userId);
        return Response.json({ ok: true });
      },
    },
  },
});
