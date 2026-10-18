import { createFileRoute } from "@tanstack/react-router";
import { auth, authConfigured } from "@/lib/auth/server";

function handleAuthRequest(request: Request): Promise<Response> | Response {
  if (!authConfigured) {
    return Response.json(
      {
        error: "AUTH_CONFIGURATION_REQUIRED",
        message: "Authentication is not configured for this deployment. Configure per-app auth credentials and durable PostgreSQL before enabling sign-in.",
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  return auth.handler(request);
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleAuthRequest(request),
      POST: ({ request }) => handleAuthRequest(request),
    },
  },
});
