import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, RefreshCw, TrendingUp, AlertCircle, Lightbulb } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Feedback = {
  headline: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  score: number;
};

export function AiInsightCard() {
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchFeedback = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("ai-feedback", {
        body: {},
      });
      if (fnError) throw fnError;
      if (data?.error) {
        setError(data.error);
        toast.error(data.error);
      } else if (data?.feedback) {
        setFeedback(data.feedback);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load AI feedback";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeedback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card className="p-6 glass shadow-card relative overflow-hidden">
      <div className="absolute -top-12 -right-12 size-40 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-lg gradient-rank flex items-center justify-center shadow-glow">
              <Sparkles className="size-4 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="font-display text-lg font-semibold leading-tight">AI Insights</h3>
              <p className="text-xs text-muted-foreground">Personalized coaching · last 30 days</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {feedback && (
              <Badge variant="outline" className="border-primary/30 text-primary">
                {feedback.score}/100
              </Badge>
            )}
            <Button variant="ghost" size="icon" onClick={fetchFeedback} disabled={loading} className="press">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            </Button>
          </div>
        </div>

        {loading && !feedback ? (
          <div className="space-y-3 py-4">
            <div className="h-4 w-2/3 bg-muted/60 rounded animate-pulse" />
            <div className="h-3 w-full bg-muted/40 rounded animate-pulse" />
            <div className="h-3 w-5/6 bg-muted/40 rounded animate-pulse" />
          </div>
        ) : error ? (
          <div className="text-sm text-muted-foreground py-4">{error}</div>
        ) : feedback ? (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed">{feedback.headline}</p>

            <div className="grid gap-3 sm:grid-cols-3">
              <Section icon={TrendingUp} tint="success" label="Strengths" items={feedback.strengths} />
              <Section icon={AlertCircle} tint="warning" label="Watch" items={feedback.weaknesses} />
              <Section icon={Lightbulb} tint="primary" label="Try this" items={feedback.suggestions} />
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function Section({
  icon: Icon,
  tint,
  label,
  items,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tint: "success" | "warning" | "primary";
  label: string;
  items: string[];
}) {
  const tintClass =
    tint === "success"
      ? "text-success bg-success/10"
      : tint === "warning"
        ? "text-warning bg-warning/10"
        : "text-primary bg-primary/10";
  return (
    <div className="space-y-2">
      <div className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-md px-2 py-1 ${tintClass}`}>
        <Icon className="size-3.5" />
        {label}
      </div>
      <ul className="space-y-1.5 text-xs text-muted-foreground">
        {items?.map((it, i) => (
          <li key={i} className="leading-relaxed">
            · {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
