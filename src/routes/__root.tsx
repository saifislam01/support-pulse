import { Outlet, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth";
import { PresenceProvider } from "@/lib/presence";
import { ThemeProvider } from "@/lib/theme";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-display font-bold text-gradient">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This page wandered off the leaderboard.
        </p>
        <a href="/" className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground press">
          Go home
        </a>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Support Performance Tracker" },
      { name: "description", content: "Track tasks, earn points, and climb the leaderboard. A performance dashboard for support engineers." },
      { property: "og:title", content: "Support Performance Tracker" },
      { name: "twitter:title", content: "Support Performance Tracker" },
      { property: "og:description", content: "Track tasks, earn points, and climb the leaderboard. A performance dashboard for support engineers." },
      { name: "twitter:description", content: "Track tasks, earn points, and climb the leaderboard. A performance dashboard for support engineers." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/65fed2b9-55b6-4594-a106-9a5070efbb6b" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/65fed2b9-55b6-4594-a106-9a5070efbb6b" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "preconnect", href: "https://ocphziubtylnalebgilu.supabase.co", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=DM+Sans:wght@400;500;600&display=swap",
      },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Outlet />
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </ThemeProvider>
  );
}
