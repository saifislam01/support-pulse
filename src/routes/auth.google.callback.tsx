import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { z } from "zod";

const searchSchema = z.object({
  code: z.string().optional(),
  error: z.string().optional(),
  state: z.string().optional(),
});

export const Route = createFileRoute("/auth/google/callback")({
  validateSearch: (s) => searchSchema.parse(s),
  component: CallbackPage,
  head: () => ({ meta: [{ title: "Connecting Google Calendar…" }] }),
});

function CallbackPage() {
  const { code, error: oauthError } = useSearch({ from: "/auth/google/callback" });
  const navigate = useNavigate();
  const [status, setStatus] = useState<"working" | "ok" | "err">("working");
  const [msg, setMsg] = useState("Linking your Google Calendar…");
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    void (async () => {
      if (oauthError) {
        setStatus("err");
        setMsg(`Google denied access: ${oauthError}`);
        return;
      }
      if (!code) {
        setStatus("err");
        setMsg("Missing authorization code from Google.");
        return;
      }

      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        setStatus("err");
        setMsg("You must be signed in to connect Google Calendar.");
        return;
      }

      const res = await fetch("/api/google/exchange", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code, redirect_uri: window.location.origin + "/auth/google/callback" }),
      });

      if (!res.ok) {
        const body = await res.text();
        setStatus("err");
        setMsg(`Could not connect: ${body || res.statusText}`);
        return;
      }

      setStatus("ok");
      setMsg("Connected! Redirecting to your calendar…");
      setTimeout(() => navigate({ to: "/calendar" }), 900);
    })();
  }, [code, oauthError, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-sm w-full text-center">
        <div className="size-12 rounded-2xl gradient-rank mx-auto flex items-center justify-center shadow-glow mb-6">
          <Sparkles className="size-6 text-primary-foreground" />
        </div>
        <div className="flex flex-col items-center gap-3">
          {status === "working" && <Loader2 className="size-6 animate-spin text-primary" />}
          {status === "ok" && <CheckCircle2 className="size-8 text-emerald-500" />}
          {status === "err" && <AlertCircle className="size-8 text-destructive" />}
          <p className="text-sm text-muted-foreground">{msg}</p>
        </div>
      </div>
    </div>
  );
}
