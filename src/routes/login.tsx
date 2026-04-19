import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({ meta: [{ title: "Sign in — Velocity" }] }),
});

const schema = z.object({
  email: z.string().trim().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

function LoginPage() {
  const { user, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [loading, user, navigate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setSubmitting(true);
    const { error } = await signIn(parsed.data.email, parsed.data.password);
    setSubmitting(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success("Welcome back");
      navigate({ to: "/dashboard" });
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex relative overflow-hidden gradient-hero">
        <div className="absolute inset-0 [background-image:radial-gradient(circle_at_30%_20%,oklch(0.78_0.18_195/0.25),transparent_50%),radial-gradient(circle_at_70%_80%,oklch(0.85_0.21_130/0.2),transparent_50%)]" />
        <div className="relative z-10 m-auto max-w-md p-12 text-center">
          <div className="size-14 rounded-2xl gradient-rank flex items-center justify-center shadow-glow mx-auto mb-8">
            <Sparkles className="size-7 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <h1 className="font-display text-4xl font-bold leading-tight">
            Track tasks. <br />
            Earn points. <br />
            <span className="text-gradient">Top the board.</span>
          </h1>
          <p className="mt-6 text-muted-foreground">
            A performance OS built for support engineers. Real-time leaderboards, AI-powered insights, and a system that rewards consistency.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="size-9 rounded-lg gradient-rank flex items-center justify-center">
              <Sparkles className="size-5 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-lg">Velocity</span>
          </div>

          <h2 className="font-display text-3xl font-bold">Sign in</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Welcome back. Pick up where you left off.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            <Button type="submit" disabled={submitting} className="w-full press shadow-glow">
              {submitting ? <Loader2 className="size-4 animate-spin" /> : "Sign in"}
            </Button>
          </form>

          <p className="mt-6 text-sm text-muted-foreground text-center">
            Don't have an account?{" "}
            <Link to="/signup" className="text-primary font-medium hover:underline">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
