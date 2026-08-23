"use client";

import * as React from "react";
import Link from "next/link";
import {
  BarChart3,
  FileText,
  MessageSquare,
  Plus,
  Sparkles,
  Table2,
  Trash2,
  Workflow,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  HintChip,
  SectionHeading,
  SettingRow,
} from "@/components/ui/card";
import {
  CheckboxField,
  NumberStepper,
  Segmented,
  Select,
  Toggle,
} from "@/components/ui/controls";
import { Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/display";
import { InfoHint } from "@/components/analytics/panels";
import { useOrgSettings, useOrganization } from "@/lib/data/queries";
import { useUpdateOrgSettings } from "@/lib/data/mutations";
import type { ImpactLevel, SummarySectionKey } from "@/lib/types";

const STRICTNESS_HINT = {
  low: "Greptile will only comment on P0s.",
  medium: "Greptile will never comment on P2s.",
  high: "Greptile will never comment on P2s.",
} as const;

const RISK_HINT: Record<ImpactLevel, string> = {
  low: "Approves only low-risk changes.",
  medium: "Approves low and medium-risk changes.",
  high: "Approves everything short of critical changes.",
  critical: "Approves every change Greptile scores 5/5.",
};

const SUMMARY_ROWS: {
  key: SummarySectionKey;
  title: string;
  description: string;
  icon: React.ReactNode;
  hint?: string;
}[] = [
  {
    key: "prSummary",
    title: "PR Summary",
    description: "Include a text summary of the changes",
    icon: <FileText className="h-5 w-5 text-muted-foreground" />,
  },
  {
    key: "confidenceScore",
    title: "Confidence Score",
    description: "Include a confidence rating for the PR",
    icon: <BarChart3 className="h-5 w-5 text-muted-foreground" />,
    hint: "How sure Greptile is that the change is safe to merge, from 0 to 5.",
  },
  {
    key: "issueTable",
    title: "Issue Table",
    description: "Show a table of important files changed with ratings",
    icon: <Table2 className="h-5 w-5 text-muted-foreground" />,
  },
  {
    key: "sequenceDiagram",
    title: "Sequence Diagram",
    description: "Generate a sequence diagram of the changes",
    icon: <Workflow className="h-5 w-5 text-muted-foreground" />,
  },
  {
    key: "commentsOutsideDiff",
    title: "Comments Outside Diff",
    description: "Allow comments on lines not in the diff",
    icon: <MessageSquare className="h-5 w-5 text-muted-foreground" />,
  },
];

const INSTRUCTIONS_PLACEHOLDER =
  'Question every "temporary" workaround that has outlived a presidential term.';

const HEADER_PLACEHOLDER = `**Heads up:** Greptile reviewed this. Push back if it's wrong — it has no feelings.
---`;

/** SPEC §8.4 — one page, seven anchored sections. */
export function ReviewSettingsView() {
  const org = useOrganization();
  const settings = useOrgSettings();
  const update = useUpdateOrgSettings();

  return (
    <div className="space-y-10 pb-16">
      {/* ── When Greptile Reviews ─────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeading
          id="when-reviews"
          title="When Greptile Reviews"
          subtitle="Control when Greptile runs and how much it reviews"
        />
        <SettingRow
          title="Auto-review on new commits"
          description="Automatically re-review when new commits are pushed to an open pull request."
          control={
            <Toggle
              checked={settings.autoReviewNewCommits}
              onChange={(autoReviewNewCommits) =>
                update({ autoReviewNewCommits })
              }
              label="Auto-review on new commits"
            />
          }
        />
        <SettingRow
          title="Review draft pull requests"
          description="When enabled, Greptile reviews draft PRs and MRs automatically."
          control={
            <Toggle
              checked={settings.reviewDraftPrs}
              onChange={(reviewDraftPrs) => update({ reviewDraftPrs })}
              label="Review draft pull requests"
            />
          }
        />
        <SettingRow
          title="File change limit"
          description="Greptile skips PRs over this file count unless someone explicitly tags @greptileai."
          control={
            <NumberStepper
              value={settings.fileChangeLimit}
              onChange={(fileChangeLimit) => update({ fileChangeLimit })}
              min={1}
              max={5000}
            />
          }
        />
        <Card className="p-5">
          <div className="text-base font-medium">Filters</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Control which pull requests Greptile reviews — PRs that don&apos;t
            pass these filters are skipped.
          </p>
          <Card className="mt-4 bg-secondary p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Select
                size="md"
                className="w-[136px]"
                value="authors"
                onChange={() => {}}
                options={[{ value: "authors" as const, label: "Authors" }]}
              />
              <Select
                size="md"
                className="w-[142px]"
                value={settings.authorFilterMode}
                onChange={(authorFilterMode) => update({ authorFilterMode })}
                options={[
                  { value: "exclude" as const, label: "Exclude" },
                  { value: "include" as const, label: "Include" },
                ]}
              />
              <div className="flex min-h-9 flex-1 flex-wrap items-center gap-2 rounded-[2px] border border-border bg-card px-2 py-1.5">
                {settings.authorFilterTokens.map((token) => (
                  <span
                    key={token}
                    className="inline-flex items-center gap-1.5 rounded-[2px] bg-secondary px-1.5 py-0.5 text-[13px]"
                  >
                    <button
                      type="button"
                      aria-label={`Remove ${token}`}
                      onClick={() =>
                        update({
                          authorFilterTokens:
                            settings.authorFilterTokens.filter(
                              (t) => t !== token,
                            ),
                        })
                      }
                      className="text-muted-foreground hover:text-foreground"
                    >
                      ×
                    </button>
                    {token}
                  </span>
                ))}
              </div>
              <Button
                variant="ghost"
                aria-label="Remove filter"
                onClick={() => update({ authorFilterTokens: [] })}
                className="h-9 w-9 p-0"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="secondary" size="sm" className="mt-4">
              <Plus className="h-3.5 w-3.5" />
              Add Filter
            </Button>
          </Card>
        </Card>
      </section>

      {/* ── PR Summaries ──────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeading
          id="pr-summaries"
          title="PR Summaries"
          subtitle="Adjust what Greptile posts at the top of the PR"
        />
        <Link
          href="/user/settings/review"
          className="inline-block text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Personal review settings
        </Link>
        <SettingRow
          title="Update pull request description"
          description="When this is on, Greptile edits the top-level pull request description to include its summary of the changes."
          control={
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">less noisy</span>
              <Toggle
                checked={settings.updatePrDescription}
                onChange={(updatePrDescription) =>
                  update({ updatePrDescription })
                }
                label="Update pull request description"
              />
            </div>
          }
        />
        <Card className="p-5">
          <div className="text-base font-medium">
            What&apos;s included in your PR summary
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose which sections appear in the summary Greptile posts on your
            pull requests.
          </p>
          <div className="mt-4 space-y-3">
            {SUMMARY_ROWS.map((row) => {
              const config = settings.summarySections[row.key];
              const patch = (next: Partial<typeof config>) =>
                update({
                  summarySections: {
                    ...settings.summarySections,
                    [row.key]: { ...config, ...next },
                  },
                });
              return (
                <Card key={row.key} className="bg-secondary p-4">
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex gap-3">
                      <div className="mt-0.5">{row.icon}</div>
                      <div>
                        <div className="flex items-center gap-1.5 text-[15px] font-medium">
                          {row.title}
                          {row.hint ? <InfoHint>{row.hint}</InfoHint> : null}
                        </div>
                        <div className="mt-0.5 text-sm text-muted-foreground">
                          {row.description}
                        </div>
                        <div className="mt-3 flex items-center gap-5">
                          <CheckboxField
                            checked={config.collapsible}
                            onChange={(collapsible) =>
                              patch({
                                collapsible,
                                defaultOpen: collapsible
                                  ? config.defaultOpen
                                  : false,
                              })
                            }
                          >
                            Collapsible
                          </CheckboxField>
                          <CheckboxField
                            checked={config.defaultOpen}
                            disabled={!config.collapsible}
                            onChange={(defaultOpen) => patch({ defaultOpen })}
                          >
                            Default Open
                          </CheckboxField>
                        </div>
                      </div>
                    </div>
                    <Toggle
                      checked={config.enabled}
                      onChange={(enabled) => patch({ enabled })}
                      label={row.title}
                    />
                  </div>
                </Card>
              );
            })}
          </div>
        </Card>
      </section>

      {/* ── Custom Instructions ───────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeading
          id="custom-instructions"
          title="Custom Instructions"
          subtitle="Fine-tune how Greptile reviews your code"
        />
        <Card className="p-5">
          <div className="flex items-center gap-1.5 text-base font-medium">
            Instructions
            <InfoHint>
              Free-form guidance appended to every review prompt for this
              organization.
            </InfoHint>
          </div>
          <Textarea
            rows={5}
            className="mt-3"
            value={settings.customInstructions}
            onChange={(event) =>
              update({ customInstructions: event.target.value })
            }
            placeholder={INSTRUCTIONS_PLACEHOLDER}
          />
        </Card>

        <SectionHeading
          id="greptile-comments"
          title="What should Greptile comment on?"
          subtitle="Adjust what Greptile should comment on"
        />
        <SettingRow
          title="Strictness Level"
          control={
            <Segmented
              value={settings.strictness}
              onChange={(strictness) => update({ strictness })}
              options={[
                { value: "low" as const, label: "Low" },
                { value: "medium" as const, label: "Medium" },
                { value: "high" as const, label: "High" },
              ]}
            />
          }
        >
          <HintChip>{STRICTNESS_HINT[settings.strictness]}</HintChip>
        </SettingRow>

        <SectionHeading
          title="What should be included in a Greptile comment?"
          subtitle="Adjust what Greptile says when replying to code and highlighting issues"
        />
        <Card className="p-5">
          <div className="text-base font-medium">Comment Header</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Custom text added to the top of every Greptile review comment.
          </p>
          <Textarea
            rows={4}
            className="mt-3 font-mono text-[13px]"
            value={settings.commentHeader}
            onChange={(event) => update({ commentHeader: event.target.value })}
            placeholder={HEADER_PLACEHOLDER}
          />
        </Card>
      </section>

      {/* ── Default Coding Agents ─────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeading
          id="coding-agents"
          title="Default Coding Agents"
          subtitle="Users who haven't configured personal IDE preferences will see these Fix with your Agent badges on review comments."
        />
        <SettingRow
          title="Prompt to Fix with AI"
          description="Adds a copy-paste prompt to review comments"
          control={
            <Toggle
              checked={settings.promptToFixWithAi}
              onChange={(promptToFixWithAi) => update({ promptToFixWithAi })}
              label="Prompt to Fix with AI"
            />
          }
        />
        <SettingRow
          title="Fix with your Agent defaults"
          description={
            <>
              Choose which coding agents appear as one-click fix buttons on
              review comments. Users can override these in{" "}
              <Link
                href="/user/settings/review"
                className="underline underline-offset-4 hover:text-foreground"
              >
                personal settings
              </Link>
              .
            </>
          }
          control={
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-[2px] bg-[hsl(var(--color-gray-950))] px-2 py-1 text-[11px] font-medium text-white">
                <Sparkles className="h-3 w-3 text-[#d97757]" />
                Fix in Claude
              </span>
              <Button variant="secondary" className="h-7 w-7 p-0">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          }
        />
      </section>

      {/* ── Status Checks ─────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeading
          id="status-checks"
          title="Status Checks"
          subtitle="Configure how to monitor Greptile"
        />
        <Card className="p-5">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="text-base font-medium">Use Status Checks</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Use status checks to indicate Greptile&apos;s review status
              </div>
            </div>
            <Toggle
              checked={settings.useStatusChecks}
              onChange={(useStatusChecks) => update({ useStatusChecks })}
              label="Use Status Checks"
            />
          </div>
          <div className="mt-6 flex items-start justify-between gap-6">
            <div>
              <div className="text-base font-medium">
                Required confidence to pass
              </div>
              <HintChip>
                {settings.requiredConfidence === 0
                  ? "The check never fails on confidence."
                  : `The check fails below ${settings.requiredConfidence}/5.`}
              </HintChip>
            </div>
            <Segmented
              value={settings.requiredConfidence}
              onChange={(requiredConfidence) => update({ requiredConfidence })}
              options={[0, 1, 2, 3, 4, 5].map((value) => ({
                value,
                label: String(value),
              }))}
            />
          </div>
        </Card>
        <SettingRow
          title="Post Status Comments"
          description="Post status comments when Greptile encounters an error or a filter"
          control={
            <Toggle
              checked={settings.postStatusComments}
              onChange={(postStatusComments) => update({ postStatusComments })}
              label="Post Status Comments"
            />
          }
        />
      </section>

      {/* ── Auto-approve PRs ──────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeading
          id="auto-approve"
          title="Auto-approve PRs"
          badge={<Badge>Beta</Badge>}
          subtitle="Let Greptile Approve Your PRs"
        />
        <SettingRow
          title="Auto-approve pull requests"
          description="Requires a 5/5 Greptile review."
          control={
            <Toggle
              checked={settings.autoApprovePrs}
              onChange={(autoApprovePrs) => update({ autoApprovePrs })}
              label="Auto-approve pull requests"
            />
          }
        />
        <SettingRow
          title="Maximum risk to auto-approve"
          description="Set the highest risk level Greptile will auto-approve."
          control={
            <Segmented
              value={settings.maxAutoApproveRisk}
              onChange={(maxAutoApproveRisk) => update({ maxAutoApproveRisk })}
              options={[
                { value: "low" as const, label: "Low" },
                { value: "medium" as const, label: "Medium" },
                { value: "high" as const, label: "High" },
                { value: "critical" as const, label: "Critical" },
              ]}
            />
          }
        >
          <HintChip>{RISK_HINT[settings.maxAutoApproveRisk]}</HintChip>
        </SettingRow>
      </section>

      <p className="sr-only">Organization: {org.name}</p>
    </div>
  );
}
