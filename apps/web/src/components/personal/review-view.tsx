"use client";

import * as React from "react";
import { BarChart3, FileText, Table2, Workflow } from "lucide-react";

import { Card, SectionHeading } from "@/components/ui/card";
import { CheckboxField, Toggle } from "@/components/ui/controls";
import { Badge, KomodoMark } from "@/components/ui/display";
import { usePersonalSettings } from "@/lib/data/queries";
import { useUpdatePersonalSettings } from "@/lib/data/mutations";
import type { PersonalSectionKey } from "@/lib/types";

/**
 * The four blocks a posted review can carry — the same four the org settings
 * name, because there is one renderer and it knows four modules.
 */
const ROWS: {
  key: PersonalSectionKey;
  title: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    key: "summary",
    title: "Summary",
    description: "What changed, in the reviewer's own words",
    icon: <FileText className="h-5 w-5 text-muted-foreground" />,
  },
  {
    key: "confidence",
    title: "Confidence Score",
    description: "The merge-confidence rating and the verdict line",
    icon: <BarChart3 className="h-5 w-5 text-muted-foreground" />,
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
                Every judgement carries a prompt written to be pasted into a
                coding agent. This decides whether the queue shows it to you.
              </div>
            </div>
            <Toggle
              checked={personal.showAiFixPrompts}
              onChange={(showAiFixPrompts) => update({ showAiFixPrompts })}
              label="Show AI fix prompts"
            />
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

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border">
            <KomodoMark className="h-4 w-4" />
          </span>
          <div>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">komodo</span>
              <Badge tone="outline">bot</Badge>
              <span className="text-muted-foreground">commented just now</span>
            </div>
            <p className="mt-1.5 text-[15px]">
              Preview how Komodo comments look on your pull requests.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
