import { useState } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { authEnabled, GROK_PROVIDERS, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { user, isPending } = useCurrentUserState();
  const [pendingProviderId, setPendingProviderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (authEnabled && isPending) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <p className="text-sm text-muted" role="status">Checking your session…</p>
      </main>
    );
  }

  if (authEnabled && user) {
    return <Navigate to="/workspace" replace />;
  }

  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6 text-fg">
      <section className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-pop">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Sign in to Taskora</h1>
          <p className="mt-1 text-sm text-muted">
            Sign in to use your account with Taskora’s optional cloud workspace.
          </p>
        </div>
        {authEnabled ? (
          <div className="space-y-2">
            {GROK_PROVIDERS.map((provider) => (
              <button
                key={provider.providerId}
                type="button"
                disabled={pendingProviderId !== null}
                onClick={() => {
                  setPendingProviderId(provider.providerId);
                  setError(null);
                  void signIn(provider.providerId, { callbackURL: "/workspace", errorCallbackURL: "/login" })
                    .catch((cause: unknown) => {
                      setError(cause instanceof Error ? cause.message : "Could not start sign-in. Please retry.");
                    })
                    .finally(() => setPendingProviderId(null));
                }}
                className="min-h-11 w-full rounded-xl border border-line px-4 text-sm font-semibold hover:bg-chip disabled:cursor-wait disabled:opacity-60"
              >
                {pendingProviderId === provider.providerId
                  ? "Opening sign-in…"
                  : `Continue with ${provider.label}`}
              </button>
            ))}
            {error && <p className="text-sm text-high-ink" role="alert">{error}</p>}
          </div>
        ) : (
          <p className="rounded-xl border border-line bg-chip p-3 text-sm text-muted" role="status">
            Sign-in is disabled for this deployment. Configure VITE_AUTH_ENABLED, the authentication provider, and a server database before enabling cloud persistence.
          </p>
        )}
        <div className="rounded-xl border border-line p-3">
          <p className="text-sm font-semibold">Need to start working now?</p>
          <p className="mt-1 text-xs text-muted">Open your personal board. It works independently while cloud sign-in is unavailable; records do not sync between deployments.</p>
          <a
            href="https://taskora-ube0f6.v2.appdeploy.ai/"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-line px-4 text-sm font-semibold hover:bg-chip"
          >
            Open personal board
          </a>
        </div>
        <Link to="/" className="inline-flex min-h-10 items-center text-sm font-medium text-primary-ink hover:underline">
          Back to Taskora
        </Link>
      </section>
    </main>
  );
}
