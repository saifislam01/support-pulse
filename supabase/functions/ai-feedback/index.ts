// AI Performance Feedback - uses Lovable AI Gateway (Gemini)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_PUBLISHABLE_KEY =
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
    if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      throw new Error("Missing environment configuration");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use the user's JWT to fetch their tasks (RLS scoped)
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.0");
    const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: tasks, error: tasksErr } = await supabase
      .from("tasks")
      .select("name, priority, status, points_awarded, created_at, completed_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200);
    if (tasksErr) throw tasksErr;

    // Compute aggregate stats to keep prompt compact
    const all = tasks ?? [];
    const completed = all.filter((t: any) => t.status === "completed");
    const pending = all.filter((t: any) => t.status === "pending");
    const totalPoints = completed.reduce((s: number, t: any) => s + (t.points_awarded ?? 0), 0);
    const byPriority = {
      high: { c: 0, p: 0 },
      medium: { c: 0, p: 0 },
      low: { c: 0, p: 0 },
    } as Record<string, { c: number; p: number }>;
    for (const t of all) {
      const k = t.priority as "high" | "medium" | "low";
      if (t.status === "completed") byPriority[k].c++;
      else byPriority[k].p++;
    }
    // Last 7d completion days
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() - i);
      return d.toISOString().slice(0, 10);
    });
    const dayCounts = last7.map((day) => ({
      day,
      count: completed.filter((t: any) => t.completed_at?.startsWith(day)).length,
    }));

    const summary = {
      window_days: 30,
      totals: { tasks: all.length, completed: completed.length, pending: pending.length, points: totalPoints },
      by_priority: byPriority,
      last_7_days: dayCounts,
    };

    const systemPrompt = `You are a concise performance coach for support engineers. Analyze the engineer's last 30 days of task data and produce honest, actionable feedback. Keep tone supportive but direct. Avoid filler.`;
    const userPrompt = `Performance data (JSON):\n${JSON.stringify(summary)}\n\nReturn structured feedback.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "deliver_feedback",
              description: "Return personalized performance insights",
              parameters: {
                type: "object",
                properties: {
                  headline: {
                    type: "string",
                    description: "1-sentence summary of overall performance",
                  },
                  strengths: {
                    type: "array",
                    items: { type: "string" },
                    description: "2-3 concise strengths",
                  },
                  weaknesses: {
                    type: "array",
                    items: { type: "string" },
                    description: "2-3 concise weaknesses or risks",
                  },
                  suggestions: {
                    type: "array",
                    items: { type: "string" },
                    description: "3 specific actionable suggestions",
                  },
                  score: {
                    type: "number",
                    description: "Overall performance score 0-100",
                  },
                },
                required: ["headline", "strengths", "weaknesses", "suggestions", "score"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "deliver_feedback" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit reached. Try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in workspace settings." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await aiResp.text();
      console.error("AI gateway error", aiResp.status, text);
      return new Response(JSON.stringify({ error: "AI request failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    const args = toolCall?.function?.arguments;
    if (!args) {
      console.error("No tool call in AI response", JSON.stringify(aiJson));
      return new Response(JSON.stringify({ error: "Could not parse AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const feedback = JSON.parse(args);

    return new Response(JSON.stringify({ feedback, summary }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-feedback error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
