"use client";

/**
 * The app shell had no error boundary at all — an uncaught exception during
 * any Server Component render (a GitHub call timing out mid-request, most
 * often) reached the browser as a bare, minified, digest-only React error
 * with no message and no way back in, because Next redacts a Server
 * Components render error's real text in production (error #441) and there
 * was nothing here to catch it and show something a person could act on.
 *
 * `retry` re-renders the segment that crashed without a full page reload —
 * the right first move for what is usually a transient GitHub timeout, not a
 * broken page. Note this catches errors below this segment, not one thrown
 * by `(app)/layout.tsx` itself (loadSnapshot et al.) — that would need a
 * boundary a level up, in the root layout's segment.
 *
 * · Signature is `{ error, retry }` in this Next.js version, not the
 *   `{ error, reset }` of older docs — see the top-level AGENTS.md notice.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="flex h-full flex-1 items-center justify-center overflow-y-auto bg-background px-4">
      <div className="w-full max-w-[440px] border border-border bg-card px-8 py-10 text-center">
        <h1 className="text-[17px]">Something went wrong.</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {error.digest
            ? "The server hit an error — often a GitHub request timing out. Retrying usually works."
            : error.message || "An unexpected error occurred."}
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            Digest: {error.digest}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => retry()}
          className="mt-6 inline-flex h-9 items-center gap-2 rounded-[2px] bg-[hsl(var(--komodo-brand-green))] px-4 text-sm font-medium text-[hsl(var(--color-gray-950))] transition-colors hover:bg-[hsl(153_75%_63%)]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
