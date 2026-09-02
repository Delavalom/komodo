"use client";

/**
 * Submitting the GitHub review, from here.
 *
 * The only surface in Komodo that can produce an approval, and it is a person
 * pressing a button with their own credential — the reviewer pipeline calls a
 * client method that hardcodes COMMENT and cannot be told otherwise. That
 * separation is the point: Komodo prepares a review, a human submits one, and
 * GitHub's record names whoever actually decided.
 *
 * The body is pre-filled from what the team answered and stays editable,
 * because the tally is a summary of the decisions and not a substitute for
 * whatever the reviewer wants to say.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useGithubIdentity } from "@/lib/data/queries";
import { useSubmitGithubReview } from "@/lib/data/mutations";
import { cn } from "@/lib/utils";

/**
 * The three things a human review can be.
 *
 * Declared here rather than imported from @komodo/core, for the same reason
 * @komodo/store's vocabularies are re-declared rather than imported: core is a
 * Node package — it reaches `node:crypto` and `node:child_process` — and a
 * client component must not name it even in a type position, because the
 * bundler decides what that costs, not TypeScript. The server action this
 * feeds takes core's own `HumanReviewEvent`, so a divergence between the two
 * stops the build.
 */
type HumanReviewEvent = "COMMENT" | "REQUEST_CHANGES" | "APPROVE";

const EVENTS: {
  event: HumanReviewEvent;
  label: string;
  hint: string;
}[] = [
  {
    event: "COMMENT",
    label: "Comment",
    hint: "Says what you found without deciding anything",
  },
  {
    event: "REQUEST_CHANGES",
    label: "Request changes",
    hint: "Sends it back to the author",
  },
  {
    event: "APPROVE",
    label: "Approve",
    hint: "Signs off on this exact commit, with your connected credential",
  },
];

export function GithubReviewPanel({
  reviewId,
  suggestedBody,
  unverifiedRequired,
  headSha,
  headMoved,
}: {
  reviewId: string;
  /** The tally and decisions, as a starting point the reviewer can rewrite. */
  suggestedBody: string;
  /** Required checks with no verified evidence — what blocks an approval. */
  unverifiedRequired: number;
  headSha: string;
  /** The pull request has moved past the head this review read. */
  headMoved: boolean;
}) {
  const router = useRouter();
  const identity = useGithubIdentity();
  const submit = useSubmitGithubReview();

  const [event, setEvent] = React.useState<HumanReviewEvent>("COMMENT");
  const [body, setBody] = React.useState(suggestedBody);
  const [override, setOverride] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [posted, setPosted] = React.useState<string | null>(null);

  const needsOverride = event === "APPROVE" && unverifiedRequired > 0;

  const send = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await submit({
        reviewId,
        event,
        body,
        override: needsOverride ? override : null,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setPosted(result.url ?? null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  if (!identity) {
    return (
      <section className="mt-8 border border-border px-3 py-3 text-sm">
        <h2 className="label-mono text-[10px] text-muted-foreground">
          Submit the GitHub review
        </h2>
        <p className="mt-2 text-muted-foreground">
          Connect your own GitHub account to review from here. A review
          submitted with the deployment&rsquo;s shared token would be recorded
          by GitHub as the deployment&rsquo;s, not yours — which is no use to
          anyone reading the history later.
        </p>
        <Link
          href="/user/settings/integrations"
          className="mt-2 inline-block text-sm underline hover:text-foreground"
        >
          Connect your GitHub account
        </Link>
      </section>
    );
  }

  if (posted) {
    return (
      <section className="mt-8 border border-border px-3 py-3 text-sm">
        <h2 className="label-mono text-[10px] text-muted-foreground">
          Submit the GitHub review
        </h2>
        <p className="mt-2">
          Submitted as {identity.login}.{" "}
          <a
            href={posted}
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-foreground"
          >
            See it on GitHub
          </a>
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8 border border-border px-3 py-3">
      <h2 className="label-mono text-[10px] text-muted-foreground">
        Submit the GitHub review
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        As {identity.login}, on {headSha.slice(0, 7)}.
      </p>
      {/* Said here as well as on the connections screen, because this is where
          the irreversible thing happens. Komodo has no sign-in: the name above
          comes from a per-device preference, not from anybody proving who they
          are. AGENTS.md rule 11. */}
      <p className="mt-1 text-xs text-muted-foreground">
        Komodo has no sign-in — anyone who can open this queue can submit this
        as {identity.login}.
      </p>

      {headMoved ? (
        // The one refusal worth stating before the button rather than after:
        // an approval names a commit, and this review read a different one.
        <p className="mt-3 border border-[hsl(var(--warn))]/40 bg-[hsl(var(--warn))]/5 px-3 py-2 text-sm">
          The pull request has moved past the commit this review read. Re-review
          the current head before submitting.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-1">
        {EVENTS.map((option) => (
          <button
            key={option.event}
            type="button"
            title={option.hint}
            aria-pressed={event === option.event}
            onClick={() => setEvent(option.event)}
            className={cn(
              "border px-3 py-1.5 text-sm transition-colors",
              event === option.event
                ? "border-[hsl(var(--accent))] text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-3">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          placeholder="What you want the author to read"
        />
      </div>

      {needsOverride ? (
        <div className="mt-3">
          <p className="text-sm text-[hsl(var(--warn))]">
            {unverifiedRequired} required verification{" "}
            {unverifiedRequired === 1 ? "check has" : "checks have"} no verified
            evidence. Record it on the Verify result tab, or say why you are
            approving without it — whatever you write here goes into the review.
          </p>
          <Textarea
            value={override}
            onChange={(e) => setOverride(e.target.value)}
            rows={2}
            placeholder="Why this can be approved without that evidence"
            className="mt-2"
          />
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-3">
        <Button
          variant={event === "APPROVE" ? "brand" : "outline"}
          disabled={pending || headMoved || (needsOverride && !override.trim())}
          onClick={() => void send()}
        >
          {pending
            ? "Submitting…"
            : event === "APPROVE"
              ? "Approve on GitHub"
              : event === "REQUEST_CHANGES"
                ? "Request changes on GitHub"
                : "Comment on GitHub"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Posted with {identity.login}&rsquo;s credential, so GitHub records
          this as theirs.
        </span>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-[hsl(var(--destructive))]">{error}</p>
      ) : null}
    </section>
  );
}
