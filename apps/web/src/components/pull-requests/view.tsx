"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  CircleGauge,
  Clock,
  GitBranch,
  Minus,
  Settings as SettingsIcon,
  Target,
  User,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { Avatar } from "@/components/ui/display";
import { FilterInput, type FacetDef } from "@/components/ui/filter-input";
import { DataTable, EmptyRow, TD, TH, THead, TR } from "@/components/ui/table";
import {
  fullName,
  useAuthors,
  useJudgments,
  useOrganization,
  useRepoIndex,
  useRepositories,
} from "@/lib/data/queries";
import { useDataStore } from "@/lib/data/store";
import {
  useRetriggerReviews,
  useSetJudgmentFilters,
} from "@/lib/data/mutations";
import { useMountEffect } from "@/lib/use-mount-effect";
import { useUrlState } from "@/lib/use-url-state";
import { absoluteStamp, cn, plural, relativeTime } from "@/lib/utils";
import { useNow } from "@/lib/data/provider";
import type { ImpactLevel, Judgment, ReviewStatus } from "@/lib/types";

const FACET_KEYS = [
  "author",
  "repo",
  "subgroup",
  "status",
  "confidence",
  "impact",
] as const;

const STATUS_VALUES: { value: ReviewStatus; label: string }[] = [
  { value: "completed", label: "Completed" },
  { value: "pending", label: "Pending" },
  { value: "skipped", label: "Skipped" },
  { value: "error", label: "Error" },
  { value: "trial_ended", label: "Trial Ended" },
  { value: "usage_limit", label: "Usage limit" },
];

const IMPACT_VALUES: { value: ImpactLevel; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const IMPACT_LABEL: Record<ImpactLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

/**
 * The review route spells the pull request out the way a person says it. A
 * judgment already carries the parts as fields, so unlike the queue — which
 * splits `prId` — there is nothing to parse here.
 */
function reviewHref(orgSlug: string, pr: Judgment): string {
  return `/${orgSlug}/-/pull-requests/${pr.repoId}/${pr.number}`;
}

export function PullRequestsView() {
  const now = useNow();
  const { get, set } = useUrlState();
  const repos = useRepositories();
  const repoIndex = useRepoIndex();
  const authors = useAuthors();
  const org = useOrganization();
  const persisted = useDataStore((s) => s.judgmentFilters);
  const setJudgmentFilters = useSetJudgmentFilters();
  const retrigger = useRetriggerReviews();

  const [selected, setSelected] = React.useState<string[]>([]);

  // The original re-writes persisted chips into the URL on arrival.
  const syncPersisted = React.useCallback(() => {
    const patch: Record<string, string | null> = {};
    let dirty = false;
    for (const key of FACET_KEYS) {
      const value = persisted[key as keyof typeof persisted];
      if (typeof value === "string" && value && !get(key)) {
        patch[key] = value;
        dirty = true;
      }
    }
    if (persisted.sort === "asc" && !get("sort")) {
      patch.sort = "asc";
      dirty = true;
    }
    if (dirty) set(patch);
  }, [persisted, get, set]);
  useMountEffect(syncPersisted);

  const active: Record<string, string> = {};
  for (const key of FACET_KEYS) {
    const value = get(key);
    if (value) active[key] = value;
  }
  const sort = get("sort") === "asc" ? "asc" : "desc";
  const [search, setSearch] = React.useState(persisted.search ?? "");

  const facets: FacetDef[] = [
    {
      key: "author",
      example: "Author Name",
      icon: <User className="h-3.5 w-3.5" />,
      loadValues: () => authors.map((a) => ({ value: a, label: a })),
    },
    {
      key: "repo",
      example: "Repo Name",
      icon: <GitBranch className="h-3.5 w-3.5" />,
      loadValues: () =>
        repos.map((r) => ({ value: fullName(r), label: fullName(r) })),
    },
    {
      key: "subgroup",
      example: "Subteam Name",
      icon: <Users className="h-3.5 w-3.5" />,
      values: [{ value: "delavalom", label: "delavalom" }],
    },
    {
      key: "status",
      example: "Status",
      icon: <SettingsIcon className="h-3.5 w-3.5" />,
      values: STATUS_VALUES,
    },
    {
      key: "confidence",
      example: "> 3",
      icon: <CircleGauge className="h-3.5 w-3.5" />,
    },
    {
      key: "impact",
      example: "Critical",
      icon: <Target className="h-3.5 w-3.5" />,
      values: IMPACT_VALUES,
    },
  ];

  const rows = useJudgments({
    search,
    author: active.author,
    repo: active.repo,
    subgroup: active.subgroup,
    status: active.status as ReviewStatus | undefined,
    confidence: active.confidence,
    impact: active.impact as ImpactLevel | undefined,
    sort,
  });

  function onFacetChange(key: string, value: string | null) {
    set({ [key]: value });
    setJudgmentFilters({ [key]: value ?? undefined } as never);
  }

  function onSearchChange(next: string) {
    setSearch(next);
    setJudgmentFilters({ search: next });
  }

  const allSelected = rows.length > 0 && selected.length === rows.length;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[1216px] px-5 py-6">
      <FilterInput
        facets={facets}
        active={active}
        onChange={onFacetChange}
        search={search}
        onSearchChange={onSearchChange}
        placeholder="Search pull requests or click to add filters"
      />

      <div className="flex h-12 items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {selected.length} selected
        </span>
        {selected.length > 0 ? (
          <Button
            variant="secondary"
            onClick={() => {
              retrigger(selected);
              setSelected([]);
            }}
          >
            Re-trigger ({selected.length})
          </Button>
        ) : null}
      </div>

      <DataTable>
        <THead>
          <tr>
            <TH className="w-12">
              <Checkbox
                checked={allSelected}
                indeterminate={selected.length > 0 && !allSelected}
                onChange={(next) =>
                  setSelected(next ? rows.map((r) => r.id) : [])
                }
                label="Select all pull requests"
              />
            </TH>
            <TH>Pull Request</TH>
            <TH
              className="w-[172px]"
              sortable
              sorted={sort}
              onSort={() => {
                const next = sort === "desc" ? "asc" : null;
                set({ sort: next });
                setJudgmentFilters({ sort: next ?? "desc" });
              }}
            >
              Last Updated
            </TH>
            <TH className="w-[172px]">Review Status</TH>
            <TH className="w-[114px]">Score</TH>
          </tr>
        </THead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyRow colSpan={4}>No results.</EmptyRow>
          ) : (
            rows.map((pr) => {
              const repo = repoIndex.get(pr.repoId);
              const checked = selected.includes(pr.id);
              return (
                <TR key={pr.id}>
                  <TD>
                    <Checkbox
                      checked={checked}
                      onChange={(next) =>
                        setSelected((prev) =>
                          next
                            ? [...prev, pr.id]
                            : prev.filter((id) => id !== pr.id),
                        )
                      }
                      label={`Select ${pr.title}`}
                    />
                  </TD>
                  <TD className="py-3">
                    <div className="flex items-start gap-2">
                      <Avatar
                        seed={repo ? fullName(repo) : pr.repoId}
                        label={repo?.name}
                        size={16}
                        className="mt-0.5"
                      />
                      <div className="min-w-0">
                        {/* Into the review, not out to GitHub. The judgements
                            are here, and they are what the row summarises. */}
                        <Link
                          href={reviewHref(org.slug, pr)}
                          className="block truncate text-[15px] transition-colors hover:text-[hsl(var(--accent))]"
                        >
                          {pr.title}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                          <span>{repo?.name}</span>
                          <span>·</span>
                          <span>#{pr.number}</span>
                          <span>·</span>
                          <span>{plural(pr.reviewCount, "review")}</span>
                          <span>·</span>
                          <span>{relativeTime(pr.updatedAt, now)}</span>
                          <span>·</span>
                          <span>{IMPACT_LABEL[pr.impact]}</span>
                        </div>
                      </div>
                    </div>
                  </TD>
                  <TD title={absoluteStamp(pr.updatedAt)}>
                    <div>{relativeTime(pr.updatedAt, now)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {plural(pr.reviewCount, "review")}
                    </div>
                  </TD>
                  <TD>
                    <ReviewStatusCell status={pr.status} />
                  </TD>
                  <TD>{pr.status === "completed" ? `${pr.score}/5` : "—"}</TD>
                </TR>
              );
            })
          )}
        </tbody>
        </DataTable>
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<ReviewStatus, string> = {
  completed: "Completed",
  pending: "Pending",
  skipped: "Skipped",
  error: "Error",
  trial_ended: "Trial Ended",
  usage_limit: "Usage limit",
};

function ReviewStatusCell({ status }: { status: ReviewStatus }) {
  const glyph = {
    completed: <Check className="h-3 w-3 text-white" strokeWidth={3} />,
    pending: <Clock className="h-3 w-3 text-white" strokeWidth={2.5} />,
    skipped: <Minus className="h-3 w-3 text-white" strokeWidth={3} />,
    error: <AlertTriangle className="h-3 w-3 text-white" strokeWidth={2.5} />,
    trial_ended: <Minus className="h-3 w-3 text-white" strokeWidth={3} />,
    usage_limit: <Minus className="h-3 w-3 text-white" strokeWidth={3} />,
  }[status];

  const tone = {
    completed: "bg-[hsl(var(--checkbox-checked))]",
    pending: "bg-[hsl(var(--warn))]",
    skipped: "bg-muted",
    error: "bg-[hsl(var(--destructive))]",
    trial_ended: "bg-muted",
    usage_limit: "bg-muted",
  }[status];

  return (
    <span className="flex items-center gap-2">
      <span
        className={cn(
          "flex h-[18px] w-[18px] items-center justify-center rounded-[2px]",
          tone,
        )}
      >
        {glyph}
      </span>
      <span className="text-sm">{STATUS_LABEL[status]}</span>
    </span>
  );
}
