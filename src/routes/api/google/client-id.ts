import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/google/client-id")({
  server: {
    handlers: {
      GET: async () => {
        const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
        if (!id) return new Response("Not configured", { status: 500 });
        // The OAuth Client ID is meant to be public (visible in the redirect URL anyway).
        return Response.json({ clientId: id });
      },
    },
  },
});
