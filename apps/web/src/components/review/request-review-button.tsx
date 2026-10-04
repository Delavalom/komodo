"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { DEPTH_LABEL, DEPTH_PASSES, REVIEW_DEPTH_ORDER } from "@komodo/store";

import { Button } from "@/components/ui/button";
import { Popover, PopoverHeading, PopoverItem } from "@/components/ui/controls";
import { useRequestAIReview } from "@/lib/data/mutations";
import type { ReviewDepth } from "@/lib/types";

const DEPTH_HINT: Record<ReviewDepth, string> = {
  standard: "One pass over the diff and the code it touches.",
  deep: "A second pass looks for what the first one missed.",
  thorough: "Architecture, scope and tests get a pass each, then a second look.",
};

/**
 * Review with AI, at a depth.
 *
 * The main button leaves the depth to the rules under Settings → Review. The
 * menu beside it picks one for this run only, overriding those rules in
 * either direction. Each entry says how many passes it spends, because that
 * is what it costs.
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
  const request = useRequestAIReview();
  const [requesting, startRequest] = React.useTransition();
  const [open, setOpen] = React.useState(false);

  function ask(depth: ReviewDepth | null) {
    setOpen(false);
    startRequest(() => request(prId, headSha, depth));
  }

  return (
    <div className="flex items-center">
      <Button variant="ghost" size="sm" disabled={requesting} onClick={() => ask(null)}>
        {requesting ? "Queuing…" : label}
      </Button>
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
        <PopoverHeading>Review depth for this run</PopoverHeading>
        {REVIEW_DEPTH_ORDER.map((depth) => (
          <PopoverItem key={depth} onClick={() => ask(depth)}>
            <span className="min-w-0">
              <span className="block">{DEPTH_LABEL[depth]}</span>
              <span className="block text-xs text-muted-foreground">{DEPTH_HINT[depth]}</span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {DEPTH_PASSES[depth]} {DEPTH_PASSES[depth] === 1 ? "pass" : "passes"}
            </span>
          </PopoverItem>
        ))}
      </Popover>
    </div>
  );
}
