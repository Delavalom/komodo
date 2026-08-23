"use client";

import * as React from "react";
import { Calendar, ExternalLink, GitBranch, User, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Checkbox,
  FilterMenuButton,
  Popover,
  PopoverHeading,
  Segmented,
} from "@/components/ui/controls";
import { cn } from "@/lib/utils";
import type { Granularity, Timeframe } from "@/lib/types";

export const TIMEFRAMES: { value: Timeframe; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "this-week", label: "This week" },
  { value: "this-month", label: "This month" },
  { value: "this-quarter", label: "This quarter" },
  { value: "this-year", label: "This year" },
  { value: "custom", label: "Custom" },
];

export interface AnalyticsFilters {
  teams: string[];
  repos: string[];
  authors: string[];
  timeframe: Timeframe;
  granularity: Granularity;
}

export const DEFAULT_FILTERS: AnalyticsFilters = {
  teams: [],
  repos: [],
  authors: [],
  timeframe: "this-month",
  granularity: "day",
};

/** SPEC §6.1 */
export function AnalyticsFilterBar({
  filters,
  onChange,
  teamOptions,
  repoOptions,
  authorOptions,
}: {
  filters: AnalyticsFilters;
  onChange: (next: AnalyticsFilters) => void;
  teamOptions: string[];
  repoOptions: string[];
  authorOptions: string[];
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <MultiSelectMenu
        icon={<Users className="h-3.5 w-3.5" />}
        heading="Teams"
        allLabel="All teams"
        options={teamOptions}
        selected={filters.teams}
        onChange={(teams) => onChange({ ...filters, teams })}
      />
      <MultiSelectMenu
        icon={<GitBranch className="h-3.5 w-3.5" />}
        heading="Repositories"
        allLabel="All repositories"
        searchPlaceholder="Search repositories..."
        options={repoOptions}
        selected={filters.repos}
        onChange={(repos) => onChange({ ...filters, repos })}
      />
      <MultiSelectMenu
        icon={<User className="h-3.5 w-3.5" />}
        heading="Authors"
        allLabel="All authors"
        searchPlaceholder="Search authors..."
        options={authorOptions}
        selected={filters.authors}
        onChange={(authors) => onChange({ ...filters, authors })}
      />
      <TimeframeMenu filters={filters} onChange={onChange} />
      <Button>
        <ExternalLink className="h-3.5 w-3.5" />
        Export
      </Button>
    </div>
  );
}

function MultiSelectMenu({
  icon,
  heading,
  allLabel,
  options,
  selected,
  onChange,
  searchPlaceholder,
}: {
  icon: React.ReactNode;
  heading: string;
  allLabel: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const all = selected.length === 0;
  const visible = options.filter((o) =>
    o.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const label = all
    ? allLabel
    : selected.length === 1
      ? selected[0]
      : `${selected.length} selected`;

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      panelClassName="w-[218px]"
      trigger={({ toggle }) => (
        <FilterMenuButton
          icon={icon}
          label={label}
          open={open}
          onToggle={toggle}
        />
      )}
    >
      <PopoverHeading>{heading}</PopoverHeading>
      {searchPlaceholder ? (
        <div className="px-2 pb-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-8 bg-secondary text-[13px]"
          />
        </div>
      ) : null}
      <div className="max-h-[264px] overflow-y-auto pb-1">
        <MenuCheckRow
          label={allLabel}
          checked={all}
          onChange={() => onChange([])}
        />
        {visible.map((option) => (
          <MenuCheckRow
            key={option}
            label={option}
            checked={all || selected.includes(option)}
            onChange={(next) => {
              const base = all ? options : selected;
              const updated = next
                ? [...new Set([...base, option])]
                : base.filter((o) => o !== option);
              onChange(updated.length === options.length ? [] : updated);
            }}
          />
        ))}
      </div>
    </Popover>
  );
}

function MenuCheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted-accent"
    >
      <Checkbox checked={checked} onChange={() => onChange(!checked)} />
      <span className="truncate">{label}</span>
    </button>
  );
}

function TimeframeMenu({
  filters,
  onChange,
}: {
  filters: AnalyticsFilters;
  onChange: (next: AnalyticsFilters) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const current =
    TIMEFRAMES.find((t) => t.value === filters.timeframe) ?? TIMEFRAMES[2];

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      panelClassName="w-[194px]"
      trigger={({ toggle }) => (
        <FilterMenuButton
          icon={<Calendar className="h-3.5 w-3.5" />}
          label={current.label}
          open={open}
          onToggle={toggle}
        />
      )}
    >
      <PopoverHeading>Timeframe</PopoverHeading>
      <div className="pb-2">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf.value}
            type="button"
            onClick={() => {
              onChange({ ...filters, timeframe: tf.value });
              setOpen(false);
            }}
            className={cn(
              "block w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted-accent",
              tf.value === filters.timeframe ? "bg-muted-accent" : "",
            )}
          >
            {tf.label}
          </button>
        ))}
      </div>
      <PopoverHeading>Granularity</PopoverHeading>
      <div className="px-3 pb-3">
        <Segmented
          size="sm"
          value={filters.granularity}
          onChange={(granularity) => onChange({ ...filters, granularity })}
          options={[
            { value: "day" as const, label: "Day" },
            { value: "week" as const, label: "Week" },
            { value: "month" as const, label: "Month" },
          ]}
        />
      </div>
    </Popover>
  );
}
