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
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tasksUrl = new URL(`${SUPABASE_URL}/rest/v1/tasks`);
    tasksUrl.searchParams.set("select", "name,priority,status,points_awarded,created_at,completed_at");
    tasksUrl.searchParams.set("created_at", `gte.${since}`);
    tasksUrl.searchParams.set("order", "created_at.desc");
    tasksUrl.searchParams.set("limit", "200");

    const tasksResp = await fetch(tasksUrl.toString(), {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
    });

    if (!tasksResp.ok) {
      const message = await tasksResp.text();
      const unauthorized = tasksResp.status === 401 || tasksResp.status === 403;
      return new Response(JSON.stringify({ error: unauthorized ? "Invalid session" : `Failed to load tasks: ${message}` }), {
        status: unauthorized ? 401 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tasks = await tasksResp.json();

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

    const buildFallbackFeedback = () => {
      const completionRate = summary.totals.tasks > 0 ? Math.round((summary.totals.completed / summary.totals.tasks) * 100) : 0;
      const activeDays = dayCounts.filter((day) => day.count > 0).length;
      const strongestPriority = Object.entries(byPriority)
        .sort((a, b) => b[1].c - a[1].c)[0]?.[0] ?? "medium";
      const backlogPriority = Object.entries(byPriority)
        .sort((a, b) => b[1].p - a[1].p)[0]?.[0] ?? "medium";

      return {
        headline:
          summary.totals.tasks === 0
            ? "No recent task data yet — complete a few tasks to unlock tailored coaching."
            : `You completed ${summary.totals.completed} of ${summary.totals.tasks} tasks in the last 30 days, with a ${completionRate}% completion rate.`,
        strengths: [
          summary.totals.completed > 0
            ? `You've closed ${summary.totals.completed} tasks in the last 30 days.`
            : "You have a clean slate to establish a strong completion rhythm.",
          totalPoints > 0
            ? `Your completed work generated ${totalPoints} points of impact.`
            : "You can unlock momentum quickly by completing a few high-value tasks.",
          activeDays >= 3
            ? `Your output was spread across ${activeDays} active days, showing steady engagement.`
            : `Your best completion volume is currently in ${strongestPriority}-priority work.`,
        ],
        weaknesses: [
          summary.totals.pending > 0
            ? `${summary.totals.pending} tasks are still open, with the biggest backlog in ${backlogPriority}-priority work.`
            : "You have no open backlog right now — keep it that way with consistent follow-through.",
          activeDays <= 1 && summary.totals.completed > 0
            ? "Most completions are clustered into very few days, which may indicate inconsistent pacing."
            : "There may be room to smooth out throughput across the week.",
          completionRate < 60 && summary.totals.tasks > 0
            ? "Your completion rate is below the ideal target, so open work may be accumulating faster than it closes."
            : "Your next gains likely come from increasing the quality and priority mix of completed tasks.",
        ],
        suggestions: [
          "Prioritize clearing one high- or medium-priority pending task early each day.",
          "Aim for a steadier daily completion rhythm instead of batching work into one spike.",
          "Review open tasks weekly and close or re-scope anything stalled.",
        ],
        score: Math.max(35, Math.min(95, completionRate || (summary.totals.completed > 0 ? 55 : 40))),
      };
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
        return new Response(JSON.stringify({
          error: "Rate limit reached. Try again in a moment.",
          fallback: true,
          feedback: buildFallbackFeedback(),
          summary,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({
          error: "AI credits exhausted. Add funds in workspace settings.",
          fallback: true,
          feedback: buildFallbackFeedback(),
          summary,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await aiResp.text();
      console.error("AI gateway error", aiResp.status, text);
      return new Response(JSON.stringify({
        error: "AI request failed",
        fallback: true,
        feedback: buildFallbackFeedback(),
        summary,
      }), {
        status: 200,
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
    return new Response(JSON.stringify({
      error: e instanceof Error ? e.message : "Unknown error",
      fallback: true,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
