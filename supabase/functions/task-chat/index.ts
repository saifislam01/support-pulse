// Task Chat - AI-powered task management via chat using Lovable AI Gateway
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
};

const tools = [
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Create a new task for the current engineer.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Short task title" },
          priority: { type: "string", enum: ["low", "medium", "high"], description: "Task priority" },
        },
        required: ["name", "priority"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_tasks",
      description: "List the engineer's tasks. Use this to find a task before completing or deleting it, or to show pending/completed tasks.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["pending", "completed", "all"], description: "Filter by status" },
          limit: { type: "number", description: "Max number of tasks to return (default 20)" },
        },
        required: ["status"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_task",
      description: "Mark a task as completed by its id. If you don't have the id, call list_tasks first to find it by name.",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string", description: "UUID of the task to complete" },
        },
        required: ["task_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_task",
      description: "Delete a task by its id.",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string", description: "UUID of the task to delete" },
        },
        required: ["task_id"],
        additionalProperties: false,
      },
    },
  },
];

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

    const { messages: incoming } = (await req.json()) as { messages: ChatMessage[] };
    if (!Array.isArray(incoming)) {
      return new Response(JSON.stringify({ error: "messages must be an array" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
    const userId = userData.user.id;

    const systemPrompt = `You are a friendly task assistant for support engineers. Help the user manage their tasks: create new ones, list pending or completed tasks, mark tasks as completed, and delete tasks.

Rules:
- When the user mentions completing a task by name, FIRST call list_tasks with status="pending" to find its id, then call complete_task with that id.
- When creating a task, infer a sensible priority (low/medium/high) from urgency words. Default to medium if unclear.
- Keep replies short, warm, and concrete. Use bullet points when listing tasks.
- After performing an action, confirm what you did in 1 sentence.`;

    const conversation: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...incoming.filter((m) => m.role === "user" || m.role === "assistant"),
    ];

    // Multi-turn tool loop (max 5 iterations to be safe)
    for (let iter = 0; iter < 5; iter++) {
      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: conversation,
          tools,
        }),
      });

      if (!aiResp.ok) {
        if (aiResp.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit reached. Try again in a moment." }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (aiResp.status === 402) {
          return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in workspace settings." }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const text = await aiResp.text();
        console.error("AI gateway error", aiResp.status, text);
        return new Response(JSON.stringify({ error: "AI request failed" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const aiJson = await aiResp.json();
      const msg = aiJson.choices?.[0]?.message;
      if (!msg) {
        return new Response(JSON.stringify({ error: "Empty AI response" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const toolCalls = msg.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        return new Response(
          JSON.stringify({ reply: msg.content ?? "" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Append assistant tool-call message
      conversation.push({ role: "assistant", content: msg.content ?? null, tool_calls: toolCalls });

      // Execute each tool call
      for (const tc of toolCalls) {
        const fnName = tc.function?.name as string;
        let args: any = {};
        try {
          args = JSON.parse(tc.function?.arguments ?? "{}");
        } catch {
          args = {};
        }

        let result: any = { ok: false, error: "Unknown tool" };
        try {
          if (fnName === "create_task") {
            const { data, error } = await supabase
              .from("tasks")
              .insert({ name: args.name, priority: args.priority ?? "medium", user_id: userId })
              .select("id, name, priority, status")
              .single();
            if (error) throw error;
            result = { ok: true, task: data };
          } else if (fnName === "list_tasks") {
            let q = supabase
              .from("tasks")
              .select("id, name, priority, status, points_awarded, created_at, completed_at")
              .order("created_at", { ascending: false })
              .limit(Math.min(args.limit ?? 20, 50));
            if (args.status === "pending") q = q.eq("status", "pending");
            else if (args.status === "completed") q = q.eq("status", "completed");
            const { data, error } = await q;
            if (error) throw error;
            result = { ok: true, count: data?.length ?? 0, tasks: data };
          } else if (fnName === "complete_task") {
            const { data, error } = await supabase
              .from("tasks")
              .update({ status: "completed" })
              .eq("id", args.task_id)
              .select("id, name, points_awarded")
              .single();
            if (error) throw error;
            result = { ok: true, task: data };
          } else if (fnName === "delete_task") {
            const { error } = await supabase.from("tasks").delete().eq("id", args.task_id);
            if (error) throw error;
            result = { ok: true };
          }
        } catch (e) {
          result = { ok: false, error: e instanceof Error ? e.message : "Tool failed" };
        }

        conversation.push({
          role: "tool",
          tool_call_id: tc.id,
          name: fnName,
          content: JSON.stringify(result),
        });
      }
    }

    return new Response(
      JSON.stringify({ reply: "I had trouble completing that — please try rephrasing." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("task-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
