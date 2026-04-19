import { useEffect, useRef, useState } from "react";
import { MessageSquare, Send, X, Loader2, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Add a high-priority task: Fix login bug",
  "Show my pending tasks",
  "Mark 'Reply to Acme ticket' as done",
];

export function TaskChat() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Hi! I can help you **add tasks**, **list pending or completed tasks**, and **mark them as done** — just tell me what you need.",
    },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  if (!user) return null;

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("task-chat", {
        body: { messages: next },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        setMessages((p) => [...p, { role: "assistant", content: `⚠️ ${data.error}` }]);
      } else {
        setMessages((p) => [...p, { role: "assistant", content: data?.reply ?? "(no response)" }]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Chat failed";
      toast.error(msg);
      setMessages((p) => [...p, { role: "assistant", content: `⚠️ ${msg}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating launcher */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed z-50 bottom-24 md:bottom-6 right-4 md:right-6 size-14 rounded-full",
          "gradient-rank shadow-glow flex items-center justify-center text-primary-foreground press",
          "transition-transform hover:scale-105"
        )}
        aria-label={open ? "Close task assistant" : "Open task assistant"}
      >
        {open ? <X className="size-6" /> : <MessageSquare className="size-6" />}
      </button>

      {/* Panel */}
      {open && (
        <div
          className={cn(
            "fixed z-50 bottom-44 md:bottom-24 right-4 md:right-6",
            "w-[calc(100vw-2rem)] sm:w-96 h-[32rem] max-h-[80vh]",
            "rounded-2xl border border-border glass shadow-2xl flex flex-col overflow-hidden",
            "animate-[fade-in_0.2s_ease-out]"
          )}
        >
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <div className="size-8 rounded-lg gradient-rank flex items-center justify-center shadow-glow">
              <Sparkles className="size-4 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display font-semibold text-sm leading-tight">Task Assistant</div>
              <div className="text-[11px] text-muted-foreground">Manage tasks by chatting</div>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="p-4 space-y-3">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                    m.role === "user"
                      ? "ml-auto bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted/60 text-foreground rounded-bl-md"
                  )}
                >
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&>*]:my-1 [&_ul]:my-1 [&_p]:my-1">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    m.content
                  )}
                </div>
              ))}
              {loading && (
                <div className="bg-muted/60 rounded-2xl rounded-bl-md px-3.5 py-2 max-w-[85%] inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Thinking…
                </div>
              )}

              {messages.length <= 1 && !loading && (
                <div className="pt-2 space-y-1.5">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium px-1">
                    Try
                  </div>
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="block w-full text-left text-xs px-3 py-2 rounded-lg border border-border bg-background/50 hover:bg-muted/60 transition-colors press"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="border-t border-border p-2 flex gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Add, list, or complete a task…"
              disabled={loading}
              className="flex-1"
            />
            <Button type="submit" size="icon" disabled={loading || !input.trim()} className="press">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
