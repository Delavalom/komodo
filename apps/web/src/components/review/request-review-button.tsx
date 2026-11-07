"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { DEPTH_LABEL, DEPTH_PASSES, REVIEW_DEPTH_ORDER } from "@komodo/store";

import { Button } from "@/components/ui/button";
import { Popover, PopoverHeading, PopoverItem } from "@/components/ui/controls";
import { useReviewProviders } from "@/lib/data/provider";
import { useRequestAIReview } from "@/lib/data/mutations";
import type { ReviewDepth, ReviewProviderName } from "@/lib/types";

const DEPTH_HINT: Record<ReviewDepth, string> = {
  standard: "One pass over the diff and the code it touches.",
  deep: "A second pass looks for what the first one missed.",
  thorough: "Architecture, scope and tests get a pass each, then a second look.",
};

const PROVIDER_LABEL: Record<ReviewProviderName, string> = {
  claude: "Claude",
  codex: "Codex",
};

/**
 * Review with AI, at a depth, on a provider.
 *
 * The main button leaves the depth to the rules under Settings → Review. The
 * menu beside it picks one for this run only, overriding those rules in
 * either direction. Each entry says how many passes it spends, because that
 * is what it costs.
 *
 * Which providers exist is the server's answer (`review.providers`, written
 * by `komodo serve` at startup). One means there is nothing to choose. Two
 * means the requester chooses, with a button each: they bill different
 * subscriptions, and which one a review spends is not Komodo's call. None
 * means this server will not run the review itself, but the job still
 * queues: an interactive Claude Code session claims it with `/komodo-claim`
 * (or `komodo-review claim`), which is the whole point of a queue with no
 * headless provider.
 */
export function RequestReviewButton({
  prId,
  headSha,
  label,
}: {
  prId: string;
  headSha: string;
  label: string;
}) {
  const providers = useReviewProviders();
  const request = useRequestAIReview();
  const [requesting, startRequest] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  // One provider is the server's default; naming it would change nothing.
  const choices: (ReviewProviderName | null)[] = providers.length > 1 ? providers : [null];

  function ask(provider: ReviewProviderName | null, depth: ReviewDepth | null) {
    setOpen(false);
    startRequest(() => request(prId, headSha, { depth, provider }));
  }

  return (
    <div className="flex items-center">
      {choices.length > 1 ? (
        <span className="mr-1 text-xs text-muted-foreground">{requesting ? "Queuing…" : `${label}:`}</span>
      ) : null}
      {choices.map((provider) => (
        <Button
          key={provider ?? "default"}
          variant="ghost"
          size="sm"
          disabled={requesting}
          title={
            providers.length === 0
              ? "This server runs no reviews itself. The job waits for a Claude Code session to claim it with /komodo-claim."
              : undefined
          }
          onClick={() => ask(provider, null)}
        >
          {provider ? PROVIDER_LABEL[provider] : requesting ? "Queuing…" : label}
        </Button>
      ))}
      <Popover
        open={open}
        onOpenChange={setOpen}
        align="end"
        panelClassName="w-[300px]"
        trigger={({ toggle }) => (
          <Button
            variant="ghost"
            size="sm"
            disabled={requesting}
            aria-label="Choose how deep this review looks"
            onClick={toggle}
            className="px-1.5"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        )}
      >
        {choices.map((provider) => (
          <React.Fragment key={provider ?? "default"}>
            <PopoverHeading>
              {provider ? `${PROVIDER_LABEL[provider]} — review depth for this run` : "Review depth for this run"}
            </PopoverHeading>
            {REVIEW_DEPTH_ORDER.map((depth) => (
              <PopoverItem key={depth} onClick={() => ask(provider, depth)}>
                <span className="min-w-0">
                  <span className="block">{DEPTH_LABEL[depth]}</span>
                  <span className="block text-xs text-muted-foreground">{DEPTH_HINT[depth]}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {DEPTH_PASSES[depth]} {DEPTH_PASSES[depth] === 1 ? "pass" : "passes"}
                </span>
              </PopoverItem>
            ))}
          </React.Fragment>
        ))}
      </Popover>
    </div>
  );
}
