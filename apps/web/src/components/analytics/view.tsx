"use client";

import * as React from "react";
import {
  Bug,
  Check,
  GitMerge,
  MessageSquare,
  ThumbsDown,
  ThumbsUp,
  Users,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/controls";
import { SearchInput } from "@/components/ui/input";
import { DataTable, EmptyRow, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusPill } from "@/components/ui/display";
import { BarChart, axisNumber } from "@/components/charts/bar-chart";
import { PullRequestIcon } from "@/components/shell/nav-icons";
import {
  AnalyticsFilterBar,
  DEFAULT_FILTERS,
  type AnalyticsFilters,
} from "@/components/analytics/filter-bar";
import {
  LeaderList,
  Panel,
  SeeAllBugsLink,
  StatStrip,
} from "@/components/analytics/panels";
import {
  REVIEW_METRIC_AXIS,
  REVIEW_METRIC_LABELS,
  fullName,
  useAddressedRateSeries,
  useAddressedRateTotals,
  useAnalyticsSummary,
  useAuthors,
  useBugsSeries,
  useCommentRatings,
  useContributorsSeries,
  useFindings,
  useFindingsSummary,
  useLeaderboards,
  useMergeTimeSeries,
  useOrganization,
  useRepositories,
  useReviewsSeries,
  type ReviewMetric,
} from "@/lib/data/queries";
import { useUrlState } from "@/lib/use-url-state";
import { cn, days, percent, relativeTime } from "@/lib/utils";
import type { Severity } from "@/lib/types";

const FINDINGS_TAB = "greptile-findings";

export function AnalyticsView() {
  const org = useOrganization();
  const { get, set } = useUrlState();
  const repos = useRepositories();
  const authors = useAuthors();

  const [filters, setFilters] =
    React.useState<AnalyticsFilters>(DEFAULT_FILTERS);
  const tab = get("tab") === FINDINGS_TAB ? "findings" : "reviews";

  const query = {
    teams: filters.teams,
    repos: filters.repos,
    authors: filters.authors,
    timeframe: filters.timeframe,
    granularity: filters.granularity,
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[1216px] px-5 py-6">
      <AnalyticsFilterBar
        filters={filters}
        onChange={setFilters}
        teamOptions={["delavalom"]}
        repoOptions={repos.map(fullName)}
        authorOptions={authors}
      />

      <div className="mt-4 flex items-end gap-1 border-b border-border">
        <TabButton
          active={tab === "reviews"}
          onClick={() => set({ tab: null })}
          icon={<PullRequestIcon className="h-3.5 w-3.5" />}
        >
          PR Reviews
        </TabButton>
        <TabButton
          active={tab === "findings"}
          onClick={() => set({ tab: FINDINGS_TAB })}
          icon={<Bug className="h-3.5 w-3.5" />}
        >
          Bugs Caught
        </TabButton>
      </div>

      {tab === "reviews" ? (
        <ReviewsTab query={query} orgSlug={org.slug} />
        ) : (
          <FindingsTab query={query} />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center gap-2 rounded-t-[2px] border px-4 py-2.5 text-sm transition-colors duration-100",
        active
          ? "border-border border-b-card bg-card text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

type Query = Parameters<typeof useAnalyticsSummary>[0];

function ReviewsTab({ query, orgSlug }: { query: Query; orgSlug: string }) {
  const [metric, setMetric] = React.useState<ReviewMetric>("prs-reviewed");
  const [severity, setSeverity] = React.useState<Severity | "all">("all");
  const [mergeStat, setMergeStat] = React.useState<"mean" | "median">("mean");

  const summary = useAnalyticsSummary(query);
  const reviews = useReviewsSeries(query, metric);
  const bugs = useBugsSeries(query, severity);
  const mergeTime = useMergeTimeSeries(query, mergeStat);
  const contributors = useContributorsSeries(query);
  const addressed = useAddressedRateSeries(query);
  const addressedTotals = useAddressedRateTotals(query);
  const ratings = useCommentRatings(query);
  const boards = useLeaderboards(query);

  return (
    <div className="mt-6 space-y-6">
      <StatStrip
        cells={[
          { label: "Total PRs", value: String(summary.totalPrs) },
          { label: "Total Reviews", value: String(summary.totalReviews) },
          { label: "Avg Merge Time", value: days(summary.avgMergeTimeDays) },
          { label: "# of bugs caught", value: String(summary.bugsCaught) },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          icon={<PullRequestIcon className="h-4 w-4" />}
          title="PRs reviewed by Greptile"
          control={
            <Select
              value={metric}
              onChange={setMetric}
              options={(
                Object.keys(REVIEW_METRIC_LABELS) as ReviewMetric[]
              ).map((value) => ({ value, label: REVIEW_METRIC_LABELS[value] }))}
            />
          }
          footerTitle="Top Repos by Review Count"
          footer={<LeaderList rows={boards.topReposByReviewCount} />}
        >
          <BarChart data={reviews} axisLabel={REVIEW_METRIC_AXIS[metric]} />
        </Panel>

        <Panel
          icon={<Bug className="h-4 w-4" />}
          title="Bugs caught"
          control={
            <Select
              value={severity}
              onChange={setSeverity}
              options={[
                { value: "all" as const, label: "All Severity" },
                { value: "P0" as const, label: "P0" },
                { value: "P1" as const, label: "P1" },
                { value: "P2" as const, label: "P2" },
              ]}
            />
          }
          footerTitle="Repos with most bugs"
          footer={
            <LeaderList
              rows={boards.reposWithMostBugs}
              after={
                <SeeAllBugsLink
                  href={`/${orgSlug}/-/analytics?tab=${FINDINGS_TAB}`}
                />
              }
            />
          }
        >
          <BarChart data={bugs} axisLabel="BUGS CAUGHT" />
        </Panel>

        <Panel
          icon={<GitMerge className="h-4 w-4" />}
          title="Average time to merge"
          control={
            <Select
              value={mergeStat}
              onChange={setMergeStat}
              options={[
                { value: "mean" as const, label: "Mean" },
                { value: "median" as const, label: "Median" },
              ]}
            />
          }
          footerTitle="Top Repos by Merge Time"
          footer={<LeaderList rows={boards.topReposByMergeTime} />}
        >
          <BarChart
            data={mergeTime}
            axisLabel="AVERAGE TIME TO MERGE"
            formatY={(v) => `${axisNumber(v)}d`}
            showAverage
            minTop={10}
          />
        </Panel>

        <Panel
          icon={<Users className="h-4 w-4" />}
          title="Top contributors"
          hint="Merged PRs split by PR author."
          footerTitle="Top contributors"
          footer={<LeaderList rows={boards.topContributors} />}
        >
          <BarChart data={contributors} axisLabel="MERGED PRS" />
        </Panel>

        <Panel
          icon={<Check className="h-4 w-4" />}
          title="Addressed rate"
          hint="Greptile comments counted as addressed when follow-up code changes resolve the feedback."
          footerTitle="Top repos by addressed rate"
          footer={<LeaderList rows={boards.topReposByAddressedRate} />}
        >
          <div className="mb-2 flex items-baseline gap-3 px-1">
            <span className="text-3xl font-semibold tracking-tight">
              {percent(addressedTotals.rate)}
            </span>
            <span className="text-sm text-muted-foreground">
              {addressedTotals.addressed}
            </span>
          </div>
          <BarChart
            data={addressed}
            axisLabel="ADDRESSED RATE"
            formatY={(v) => axisNumber(v)}
            showAverage
            minTop={5}
          />
        </Panel>

        <Panel
          icon={<MessageSquare className="h-4 w-4" />}
          title="Comment ratings"
          footerTitle="Most Upvoted Comments"
          footer={<LeaderList rows={boards.mostUpvotedComments} />}
        >
          <div className="flex gap-12 px-1 pb-4">
            <div>
              <div className="label-mono flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <ThumbsUp className="h-3.5 w-3.5" />
                Upvotes
              </div>
              <div className="mt-2 text-2xl font-semibold">
                {ratings.upvotes}
              </div>
            </div>
            <div>
              <div className="label-mono flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <ThumbsDown className="h-3.5 w-3.5" />
                Downvotes
              </div>
              <div className="mt-2 text-2xl font-semibold">
                {ratings.downvotes}
              </div>
            </div>
          </div>
          {ratings.upvotes === 0 && ratings.downvotes === 0 ? (
            <div className="flex h-[150px] items-center justify-center text-sm text-muted-foreground">
              No comment ratings
            </div>
          ) : (
            <div className="h-[150px]" />
          )}
        </Panel>
      </div>
    </div>
  );
}

const SEVERITY_TONE: Record<Severity, "error" | "warn" | "default"> = {
  P0: "error",
  P1: "warn",
  P2: "default",
};

function FindingsTab({ query }: { query: Query }) {
  const [search, setSearch] = React.useState("");
  const summary = useFindingsSummary(query);
  const rows = useFindings(query, search);

  return (
    <div className="mt-6 space-y-6">
      <StatStrip
        cells={[
          { label: "All bugs", value: String(summary.all) },
          {
            label: "Security",
            value: String(summary.security),
            hint: "Findings Greptile classified as security-relevant.",
          },
          {
            label: "P0",
            value: String(summary.p0),
            hint: "Blocking issues — ship-stoppers.",
          },
          {
            label: "P1",
            value: String(summary.p1),
            hint: "Important issues worth fixing before merge.",
          },
          {
            label: "P2",
            value: String(summary.p2),
            hint: "Minor issues and nits.",
          },
        ]}
      />

      <div>
        <h2 className="text-xl font-medium tracking-tight">Bugs Caught</h2>
        <div className="mt-4">
          <SearchInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search bugs by text, repo, PR, author, or file..."
          />
        </div>
      </div>

      <DataTable>
        <THead>
          <tr>
            <TH>Finding</TH>
            <TH className="w-[110px]">Severity</TH>
            <TH className="w-[220px]">Pull Request</TH>
            <TH className="w-[130px]">Status</TH>
            <TH className="w-[140px]">Date</TH>
          </tr>
        </THead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyRow colSpan={5}>No bugs found</EmptyRow>
          ) : (
            rows.slice(0, 50).map((row) => (
              <TR key={row.id}>
                <TD>
                  <div className="truncate">{row.title}</div>
                  <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
                    {row.filePath}
                  </div>
                </TD>
                <TD>
                  <StatusPill tone={SEVERITY_TONE[row.severity]}>
                    {row.severity}
                  </StatusPill>
                </TD>
                <TD>
                  <a
                    href={row.prUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-sm transition-colors hover:text-[hsl(var(--accent))]"
                  >
                    {row.repoFullName} #{row.prNumber}
                  </a>
                </TD>
                <TD>
                  <StatusPill
                    tone={row.status === "addressed" ? "success" : "default"}
                  >
                    {row.status}
                  </StatusPill>
                </TD>
                <TD className="text-muted-foreground">
                  {relativeTime(row.createdAt)}
                </TD>
              </TR>
            ))
          )}
        </tbody>
      </DataTable>

      {rows.length > 50 ? (
        <Card className="p-4 text-center text-sm text-muted-foreground">
          Showing the 50 most recent of {rows.length} findings.
        </Card>
      ) : null}
    </div>
  );
}
