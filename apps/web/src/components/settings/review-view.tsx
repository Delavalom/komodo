"use client";

import * as React from "react";
import Link from "next/link";
import {
  BarChart3,
  FileText,
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
import { InfoHint } from "@/components/analytics/panels";
import { useOrgSettings, useOrganization } from "@/lib/data/queries";
import { useUpdateOrgSettings } from "@/lib/data/mutations";
import type { SummarySectionKey } from "@/lib/types";

/**
 * Strictness is a floor on severity — see MIN_SEVERITY in
 * packages/ingest/src/settings.ts, which is where this turns into config the
 * reviewer reads.
 */
const STRICTNESS_HINT = {
  low: "Only critical findings. Everything else is dropped.",
  medium: "Critical and major findings. Minor ones are dropped.",
  high: "Everything down to minor findings.",
} as const;

/**
 * The blocks a posted review can carry.
 *
 * One per module in @komodo/core's renderer — no more. The screen used to
 * offer an "Issue Table" and "Comments Outside Diff" that nothing rendered,
 * which made every other control here look equally decorative.
 *
 * They apply to what GitHub gets in `post.mode: full`. In the default receipt
 * mode GitHub gets a link and the review itself lives in Komodo, where none of
 * this applies.
 */
const SUMMARY_ROWS: {
  key: SummarySectionKey;
  title: string;
  description: string;
  icon: React.ReactNode;
  hint?: string;
}[] = [
  {
    key: "summary",
    title: "Summary",
    description: "What changed, in the reviewer's own words",
    icon: <FileText className="h-5 w-5 text-muted-foreground" />,
  },
  {
    key: "confidence",
    title: "Review coverage",
    description: "How much context the AI brief had, never a merge recommendation",
    icon: <BarChart3 className="h-5 w-5 text-muted-foreground" />,
    hint: "How well grounded the AI review brief is, from 0 to 5.",
  },
  {
    key: "walkthrough",
    title: "Walkthrough",
    description: "Related files grouped into rows, each with a plain-language note",
    icon: <Table2 className="h-5 w-5 text-muted-foreground" />,
  },
  {
    key: "diagram",
    title: "Sequence Diagram",
    description: "A Mermaid diagram, when the change moved a flow",
    icon: <Workflow className="h-5 w-5 text-muted-foreground" />,
  },
];

const INSTRUCTIONS_PLACEHOLDER =
  'Question every "temporary" workaround that has outlived a presidential term.';

const HEADER_PLACEHOLDER = `**Heads up:** Komodo reviewed this. Push back if it's wrong — it has no feelings.
---`;

export function ReviewSettingsView() {
  const org = useOrganization();
  const settings = useOrgSettings();
  const update = useUpdateOrgSettings();
  const [draftToken, setDraftToken] = React.useState("");

  /** Commits whatever is in the box, ignoring a repeat and a blank. */
  function addToken() {
    const token = draftToken.trim().replace(/,$/, "");
    setDraftToken("");
    if (!token) return;
    if (settings.authorFilterTokens.includes(token)) return;
    update({ authorFilterTokens: [...settings.authorFilterTokens, token] });
  }

  return (
    <div className="space-y-10 pb-16">
      {/* ── When Komodo Reviews ───────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeading
          id="when-reviews"
          title="When Komodo Reviews"
          subtitle="Which pull requests are worth a review, and when"
        />
        <SettingRow
          title="Auto-review new pull requests"
          description="Review pull requests first seen after a repository's initial inventory import. Existing backlog stays inventory-only until selected manually."
          control={
            <Toggle
              checked={settings.autoReviewNewPullRequests}
              onChange={(autoReviewNewPullRequests) =>
                update({ autoReviewNewPullRequests })
              }
              label="Auto-review new pull requests"
            />
          }
        />
        <SettingRow
          title="Auto-review on new commits"
          description="Re-review when new commits are pushed. Off, the first verdict stands until someone retriggers it from the queue."
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
          description="When enabled, Komodo reviews draft pull requests too."
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
          description="Pull requests touching more files than this are skipped and marked as such. Set 0 for no limit."
          control={
            <NumberStepper
              value={settings.fileChangeLimit}
              onChange={(fileChangeLimit) => update({ fileChangeLimit })}
              min={0}
              max={5000}
            />
          }
        />
        <Card className="p-5">
          <div className="text-base font-medium">Filters</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Pull requests whose author does not pass this filter are skipped
            and recorded as skipped, not silently dropped.
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
                {/* The list could be emptied and never added to: every token
                    on screen had come from komodo.yaml, and the filter was
                    unreachable for anyone without shell access to the server.
                    Enter commits, which is also what the chips expect. */}
                <input
                  value={draftToken}
                  onChange={(event) => setDraftToken(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === ",") {
                      event.preventDefault();
                      addToken();
                    }
                  }}
                  onBlur={addToken}
                  placeholder={
                    settings.authorFilterTokens.length
                      ? "Add a login…"
                      : "dependabot[bot]"
                  }
                  aria-label="Add a GitHub login to the author filter"
                  className="min-w-[140px] flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
                />
              </div>
              <Button
                variant="ghost"
                aria-label="Clear the author filter"
                onClick={() => update({ authorFilterTokens: [] })}
                className="h-9 w-9 p-0"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {settings.authorFilterMode === "exclude"
                ? "Pull requests opened by these logins are skipped."
                : "Only pull requests opened by these logins are reviewed."}
            </p>
          </Card>
        </Card>
      </section>

      {/* ── PR Summaries ──────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeading
          id="pr-summaries"
          title="PR Summaries"
          subtitle="What Komodo posts on the pull request itself"
        />
        <Link
          href="/user/settings/review"
          className="inline-block text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Personal review settings
        </Link>
        <SettingRow
          title="Update pull request description"
          description="When this is on, Komodo edits the pull request description to include its summary of the changes."
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
            Choose which blocks appear in the review Komodo posts. These apply
            when posting is set to full; in the default receipt mode GitHub gets
            a link and the review lives here.
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
          subtitle="Guidance handed to the reviewer with every diff"
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
          id="komodo-comments"
          title="What should Komodo comment on?"
          subtitle="The severity floor for everything it raises"
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
          title="What should be included in a Komodo comment?"
          subtitle="Text Komodo adds to whatever it posts"
        />
        <Card className="p-5">
          <div className="text-base font-medium">Comment Header</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Custom text added to the top of every comment Komodo posts.
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

      {/* ── Fix prompts ───────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeading
          id="fix-prompts"
          title="Fix Prompts"
          subtitle="Every judgement carries a prompt written to be pasted into a coding agent. This decides whether it also travels to GitHub."
        />
        <SettingRow
          title="Include fix prompts in posted comments"
          description="Adds a collapsed copy-paste prompt under each inline comment. The queue always shows it; this is only about what GitHub gets."
          control={
            <Toggle
              checked={settings.promptToFixWithAi}
              onChange={(promptToFixWithAi) => update({ promptToFixWithAi })}
              label="Include fix prompts in posted comments"
            />
          }
        />
      </section>

      {/* ── Status Checks ─────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeading
          id="status-checks"
          title="Verification status"
          subtitle="A pending commit status that says human verification is still required"
        />
        <Card className="p-5">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="text-base font-medium">Use verification status</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Post a pending status after AI preflight. A human approval remains separate in GitHub.
              </div>
            </div>
            <Toggle
              checked={settings.useStatusChecks}
              onChange={(useStatusChecks) => update({ useStatusChecks })}
              label="Use verification status"
            />
          </div>
        </Card>
        <SettingRow
          title="Post Status Comments"
          description="Comment on the pull request when a review was skipped or could not finish, saying which and why"
          control={
            <Toggle
              checked={settings.postStatusComments}
              onChange={(postStatusComments) => update({ postStatusComments })}
              label="Post Status Comments"
            />
          }
        />
      </section>

      <p className="sr-only">Organization: {org.name}</p>
    </div>
  );
}
