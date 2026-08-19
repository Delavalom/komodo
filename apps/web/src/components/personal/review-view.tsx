"use client";

import * as React from "react";
import {
  Code2,
  FileText,
  MessageSquare,
  Plus,
  Table2,
  Workflow,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, SectionHeading } from "@/components/ui/card";
import { CheckboxField, Segmented, Toggle } from "@/components/ui/controls";
import { Badge, GreptileMark, TrexIcon } from "@/components/ui/display";
import { usePersonalSettings } from "@/lib/data/queries";
import { useUpdatePersonalSettings } from "@/lib/data/mutations";
import type { PersonalSectionKey } from "@/lib/types";

const ROWS: {
  key: PersonalSectionKey;
  title: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    key: "summary",
    title: "Summary",
    description: "Include a text summary of the changes",
    icon: <FileText className="h-5 w-5 text-muted-foreground" />,
  },
  {
    key: "issuesTable",
    title: "Issues Table",
    description: "Show a table of important files changed with ratings",
    icon: <Table2 className="h-5 w-5 text-muted-foreground" />,
  },
  {
    key: "diagram",
    title: "Diagram",
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

/** SPEC §9.2 */
export function PersonalReviewView() {
  const personal = usePersonalSettings();
  const update = useUpdatePersonalSettings();

  return (
    <div className="space-y-8 pb-12">
      <section className="space-y-4">
        <SectionHeading title="Fix with AI" />
        <Card className="p-5">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="text-base font-medium">Show AI fix prompts</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Copy &amp; paste into your coding agent
              </div>
            </div>
            <Toggle
              checked={personal.showAiFixPrompts}
              onChange={(showAiFixPrompts) => update({ showAiFixPrompts })}
              label="Show AI fix prompts"
            />
          </div>

          <div className="mt-6">
            <div className="text-base font-medium">Fix with your Agent</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Link your profile and choose your coding agents.
            </div>
            <Card className="mt-4 p-5">
              <ol className="relative space-y-6">
                <li className="flex items-center gap-3">
                  <span className="relative z-10 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-[10px] text-[hsl(var(--background))]">
                    ✓
                  </span>
                  <span className="text-sm">1. Profile linked</span>
                  <span
                    aria-hidden
                    className="absolute left-[10px] top-5 h-6 w-px bg-border"
                  />
                </li>
                <li className="flex flex-col gap-3">
                  <span className="flex items-center gap-3">
                    <span className="flex h-5 w-5 items-center justify-center rounded-[3px] border border-border bg-secondary">
                      <Code2 className="h-3 w-3" />
                    </span>
                    <span className="text-sm font-medium">
                      2. Choose your coding agents
                    </span>
                  </span>
                  <div className="pl-8">
                    <Button variant="secondary" size="sm">
                      <Plus className="h-3.5 w-3.5" />
                      Select agent
                    </Button>
                  </div>
                </li>
              </ol>
            </Card>
          </div>
        </Card>
      </section>

      <section className="space-y-4">
        <SectionHeading title="Review Preferences" />
        <Card className="space-y-3 p-5">
          {ROWS.map((row) => {
            const config = personal.reviewSections[row.key];
            const patch = (next: Partial<typeof config>) =>
              update({
                reviewSections: {
                  ...personal.reviewSections,
                  [row.key]: { ...config, ...next },
                },
              });
            return (
              <Card key={row.key} className="bg-secondary p-4">
                <div className="flex items-start justify-between gap-6">
                  <div className="flex gap-3">
                    <div className="mt-0.5">{row.icon}</div>
                    <div>
                      <div className="text-[15px] font-medium">{row.title}</div>
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
        </Card>
      </section>

      <section className="space-y-4">
        <SectionHeading
          title="TREX Settings"
          badge={<Badge>Beta</Badge>}
          icon={<TrexIcon className="h-5 w-5" />}
        />
        <Card className="p-5">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="text-base font-medium">TREX on my PRs</div>
              <p className="mt-1 max-w-[720px] text-sm text-muted-foreground">
                Run TREX-powered runtime validation on reviews you author.{" "}
                <strong className="font-medium text-foreground">Default</strong>{" "}
                follows your organization&rsquo;s TREX setting.{" "}
                <strong className="font-medium text-foreground">Off</strong>{" "}
                disables it for your PRs.
              </p>
            </div>
            <Segmented
              value={personal.trexOnMyPrs}
              onChange={(trexOnMyPrs) => update({ trexOnMyPrs })}
              options={[
                { value: "default" as const, label: "Default" },
                { value: "off" as const, label: "Off" },
              ]}
            />
          </div>
        </Card>
      </section>

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border">
            <GreptileMark className="h-4 w-4" />
          </span>
          <div>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">greptile</span>
              <Badge tone="outline">bot</Badge>
              <span className="text-muted-foreground">commented just now</span>
            </div>
            <p className="mt-1.5 text-[15px]">
              Preview how Greptile comments look on your pull requests.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
