"use client";

import * as React from "react";
import { BarChart3, Calendar, Filter } from "lucide-react";

import { Card, PanelHeader, SectionHeading } from "@/components/ui/card";
import { Select } from "@/components/ui/controls";
import { Avatar } from "@/components/ui/display";
import { DataTable, TD, TH, THead, TR } from "@/components/ui/table";
import { Sparkline, UsageBarChart } from "@/components/charts/bar-chart";
import { InfoHint } from "@/components/analytics/panels";
import { useMembers, useUsageDays, useUsageWindow } from "@/lib/data/queries";
import { monthDay, ordinalRange } from "@/lib/utils";

const SERIES = [
  { key: "codeReviewCredits", name: "Code Review", color: "hsl(155 78% 45%)" },
  { key: "cliCredits", name: "CLI", color: "hsl(320 72% 62%)" },
] as const;

export function UsageView() {
  const days = useUsageDays();
  const window = useUsageWindow();
  const members = useMembers();
  const [team, setTeam] = React.useState("all");
  const [unit, setUnit] = React.useState<"credits" | "reviews">("credits");

  const labels = days.map((d) => monthDay(d.date));
  const series = SERIES.map((s) => ({
    name: s.name,
    color: s.color,
    values: days.map((d) =>
      unit === "reviews" && s.key !== "codeReviewCredits" ? 0 : d[s.key],
    ),
  }));

  const totals = SERIES.map((s, i) => ({
    name: s.name,
    color: s.color,
    credits: series[i].values.reduce((sum, v) => sum + v, 0),
    reviews:
      s.key === "codeReviewCredits"
        ? days.reduce((sum, d) => sum + d.reviews, 0)
        : 0,
    values: series[i].values,
  }));

  const creditsByDeveloper = totals[0].credits;

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeading title="Overview" />
        <div className="flex items-center gap-3">
          <Select
            size="md"
            className="w-[144px]"
            value={team}
            onChange={setTeam}
            options={[
              { value: "all", label: "All Teams" },
              { value: "delavalom", label: "delavalom" },
            ]}
          />
          <Select
            size="md"
            className="w-[144px]"
            value={unit}
            onChange={setUnit}
            options={[
              { value: "credits" as const, label: "Credits" },
              { value: "reviews" as const, label: "Reviews" },
            ]}
          />
          <div className="flex h-9 items-center rounded-[2px] border border-border bg-card px-3 text-[13px]">
            {ordinalRange(window.from, window.to)}
          </div>
          <button
            type="button"
            aria-label="Pick a range"
            className="flex h-9 w-9 items-center justify-center rounded-[2px] border border-border bg-card text-muted-foreground transition-colors hover:bg-muted-accent hover:text-foreground"
          >
            <Calendar className="h-4 w-4" />
          </button>
        </div>
      </div>

      <Card>
        <PanelHeader
          icon={<BarChart3 className="h-4 w-4" />}
          title="Daily credit usage"
        />
        <div className="px-4 py-4">
          <UsageBarChart labels={labels} series={series} />
        </div>
        <div className="border-t border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground">
                <th className="px-5 py-2.5 text-left font-normal" />
                <th className="px-5 py-2.5 text-left font-normal" />
                <th className="w-[120px] px-5 py-2.5 text-right font-normal">
                  Reviews
                </th>
                <th className="w-[120px] px-5 py-2.5 text-right font-normal">
                  Credits
                </th>
              </tr>
            </thead>
            <tbody>
              {totals.map((row) => (
                <tr key={row.name}>
                  <td className="w-[180px] px-5 py-2.5">
                    <span className="flex items-center gap-2.5">
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 rounded-[2px]"
                        style={{ background: row.color }}
                      />
                      {row.name}
                    </span>
                  </td>
                  <td className="px-5 py-2.5">
                    <Sparkline data={row.values} color={row.color} />
                  </td>
                  <td className="px-5 py-2.5 text-right">{row.reviews}</td>
                  <td className="px-5 py-2.5 text-right">{row.credits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <section className="space-y-4">
        <SectionHeading title="Developer Usage" />
        <DataTable>
          <THead>
            <tr>
              <TH>Developer</TH>
              <TH className="w-[548px]">
                <span className="inline-flex items-center gap-1.5">
                  Credits Used
                  <InfoHint>
                    Credits consumed by reviews on pull requests this developer
                    authored.
                  </InfoHint>
                </span>
              </TH>
              <TH className="w-[96px]">Action</TH>
            </tr>
          </THead>
          <tbody>
            {members.map((member) => (
              <TR key={member.id}>
                <TD>
                  <span className="flex items-center gap-2.5">
                    <Avatar
                      seed={member.avatarSeed}
                      label={member.name}
                      size={22}
                    />
                    {member.name.split(" ")[0]}
                  </span>
                </TD>
                <TD>{creditsByDeveloper}</TD>
                <TD>
                  <button
                    type="button"
                    aria-label="Filter by developer"
                    className="flex h-8 w-8 items-center justify-center rounded-[2px] text-muted-foreground transition-colors hover:bg-muted-accent hover:text-foreground"
                  >
                    <Filter className="h-4 w-4" />
                  </button>
                </TD>
              </TR>
            ))}
          </tbody>
        </DataTable>
      </section>
    </div>
  );
}
