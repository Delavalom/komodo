"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { DEPTH_LABEL, DEPTH_PASSES, REVIEW_DEPTH_ORDER } from "@komodo/store";

import { Button } from "@/components/ui/button";
import { Card, SectionHeading, SettingRow } from "@/components/ui/card";
import { Segmented, Select } from "@/components/ui/controls";
import { Input } from "@/components/ui/input";
import { useOrgSettings } from "@/lib/data/queries";
import { useUpdateOrgSettings } from "@/lib/data/mutations";
import {
  DEPTH_RULE_KINDS,
  depthRuleProblem,
  type DepthRuleKind,
} from "@/lib/data/depth-settings";
import type { ReviewDepth } from "@/lib/types";

const RULE_KIND_LABEL: Record<DepthRuleKind, string> = {
  files: "Changed files at least",
  lines: "Changed lines at least",
  path: "Touches a path matching",
  label: "Has the label",
};

const RULE_PLACEHOLDER: Record<DepthRuleKind, string> = {
  files: "28",
  lines: "800",
  path: "migrations/**",
  label: "needs-deep-review",
};

/**
 * Settings → Review → Review Depth.
 *
 * Both fields here are read by packages/ingest/src/settings.ts and handed to
 * the reviewer as `config.depth` — see AGENTS.md rule 3. Rules are added
 * whole and removed whole rather than edited in place, so nothing is saved
 * on a keystroke and a half-typed number never reaches the reviewer. What
 * counts as a valid rule lives in lib/data/depth-settings.ts, which the
 * server action checks too.
 */
export function ReviewDepthSection() {
  const settings = useOrgSettings();
  const update = useUpdateOrgSettings();
  const [kind, setKind] = React.useState<DepthRuleKind>("files");
  const [value, setValue] = React.useState("");
  const [depth, setDepth] = React.useState<ReviewDepth>("thorough");
  const problem = depthRuleProblem(kind, value);

  function addRule() {
    if (problem) return;
    update({ depthRules: [...settings.depthRules, { kind, value: value.trim(), depth }] });
    setValue("");
  }

  return (
    <section className="space-y-4">
      <SectionHeading
        id="review-depth"
        title="Review Depth"
        subtitle="How many passes a review makes, and when it makes more"
      />
      <SettingRow
        title="Default depth"
        description="Standard is one pass. Deep adds a second look for what the first missed. Thorough gives architecture, scope and tests a pass each, then a second look. Each pass is one credit."
        control={
          <Segmented
            value={settings.reviewDepth}
            onChange={(reviewDepth) => update({ reviewDepth })}
            options={REVIEW_DEPTH_ORDER.map((d) => ({
              value: d,
              label: `${DEPTH_LABEL[d]} · ${DEPTH_PASSES[d]}`,
            }))}
          />
        }
      />
      <Card className="p-5">
        <div className="text-base font-medium">Go deeper when</div>
        <p className="mt-1 text-sm text-muted-foreground">
          The deepest matching rule wins. No rule takes a review below the
          default, and a depth picked from the Review with AI menu overrides
          all of them for that run. Files and lines are counted after path
          filters, so lockfiles and build output don&apos;t count.
        </p>
        <div className="mt-4 space-y-2">
          {settings.depthRules.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No rules yet. Every review runs at the default depth.
            </p>
          ) : null}
          {settings.depthRules.map((rule, index) => (
            <div
              key={`${rule.kind}:${rule.value}:${index}`}
              className="flex items-center justify-between gap-3 rounded-[2px] border border-border bg-secondary px-3 py-2 text-sm"
            >
              <span>
                {RULE_KIND_LABEL[rule.kind]}{" "}
                <span className="font-mono">{rule.value}</span> →{" "}
                {DEPTH_LABEL[rule.depth]}
              </span>
              <Button
                variant="ghost"
                aria-label={`Remove the rule: ${RULE_KIND_LABEL[rule.kind]} ${rule.value}`}
                onClick={() =>
                  update({ depthRules: settings.depthRules.filter((_, i) => i !== index) })
                }
                className="h-8 w-8 p-0"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Select
            size="md"
            className="w-[220px]"
            value={kind}
            onChange={setKind}
            options={DEPTH_RULE_KINDS.map((k) => ({ value: k, label: RULE_KIND_LABEL[k] }))}
          />
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addRule();
              }
            }}
            placeholder={RULE_PLACEHOLDER[kind]}
            aria-label="Rule value"
            className="w-[200px]"
          />
          <Select
            size="md"
            className="w-[140px]"
            value={depth}
            onChange={setDepth}
            options={REVIEW_DEPTH_ORDER.map((d) => ({ value: d, label: DEPTH_LABEL[d] }))}
          />
          <Button onClick={addRule} disabled={Boolean(problem)}>
            Add rule
          </Button>
        </div>
        {value && problem ? (
          <p className="mt-2 text-sm text-[hsl(var(--error))]">{problem}</p>
        ) : null}
      </Card>
    </section>
  );
}
