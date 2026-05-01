import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/google/exchange")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }
        const token = auth.slice(7);

        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
        const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Server misconfigured (Supabase)", { status: 500 });
        }
        if (!CLIENT_ID || !CLIENT_SECRET) {
          return new Response("Server misconfigured (Google OAuth)", { status: 500 });
        }

        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });
        const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
        if (claimsErr || !claims?.claims?.sub) {
          return new Response("Unauthorized", { status: 401 });
        }
        const userId = claims.claims.sub;

        let body: { code?: string; redirect_uri?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        if (!body.code || !body.redirect_uri) {
          return new Response("Missing code or redirect_uri", { status: 400 });
        }

        // Exchange code for tokens
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code: body.code,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            redirect_uri: body.redirect_uri,
            grant_type: "authorization_code",
          }),
        });
        if (!tokenRes.ok) {
          const t = await tokenRes.text();
          return new Response(`Google token exchange failed: ${t}`, { status: 400 });
        }
        const tokenJson = (await tokenRes.json()) as {
          access_token: string;
          refresh_token?: string;
          expires_in: number;
          scope: string;
          id_token?: string;
        };

        if (!tokenJson.refresh_token) {
          return new Response(
            "No refresh token returned. Disconnect this app from your Google account and reconnect with prompt=consent.",
            { status: 400 }
          );
        }

        // Get user's google email
        let googleEmail: string | null = null;
        try {
          const userInfo = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: { Authorization: `Bearer ${tokenJson.access_token}` },
          });
          if (userInfo.ok) {
            const ui = (await userInfo.json()) as { email?: string };
            googleEmail = ui.email ?? null;
          }
        } catch {
          // non-fatal
        }

        const expiresAt = new Date(Date.now() + tokenJson.expires_in * 1000).toISOString();

        const { error: upsertErr } = await supabase.from("user_google_tokens").upsert({
          user_id: userId,
          google_email: googleEmail,
          access_token: tokenJson.access_token,
          refresh_token: tokenJson.refresh_token,
          expires_at: expiresAt,
          scope: tokenJson.scope,
          updated_at: new Date().toISOString(),
        });
        if (upsertErr) {
          return new Response(`DB error: ${upsertErr.message}`, { status: 500 });
        }

        return Response.json({ ok: true, email: googleEmail });
      },
    },
  },
});
