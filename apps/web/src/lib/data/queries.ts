"use client";

/**
 * Read seam.
 *
 * The shared entities come from the server snapshot through useSnapshot();
 * the configuration surfaces with no backing table yet still read local
 * state. Each hook changed one line to cross over, which is what the seam was
 * built for.
 *
 * Analytics are DERIVED here from the entity list, never stored, so a filtered
 * list and its summary widgets can never disagree. That is also why the
 * snapshot is unpaginated: a team's review history is hundreds of rows.
 */
import { useMemo } from "react";

import { useNow, useSnapshot } from "@/lib/data/provider";
import { useDataStore } from "@/lib/data/store";
import {
  DAY_MS,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
} from "@/lib/utils";
import type {
  AnalyticsQuery,
  AnalyticsSummary,
  ApiKey,
  Finding,
  FindingsSummary,
  Granularity,
  Integration,
  Judgment,
  JudgmentQuery,
  LeaderRow,
  Member,
  MemoryQuery,
  MemoryRuleStats,
  Organization,
  OrgSettings,
  PersonalSettings,
  QueueQuery,
  QueueRow,
  RepoCluster,
  Repository,
  SeriesPoint,
  Severity,
  Team,
  Timeframe,
  UsageDay,
} from "@/lib/types";

/* ── Org ────────────────────────────────────────────────────────────────── */

/**
 * The organization, under the name the team chose for it.
 *
 * Two rows hold a name: `organizations`, which komodo.yaml rewrites on every
 * boot, and `settings.orgDisplayName`, which the Organization screen owns. The
 * screen wrote to the second and every surface read the first, so renaming the
 * deployment changed nothing anyone could see. The stored preference wins when
 * it is set, exactly as it does for every other field on that screen.
 */
export function useOrganization(): Organization {
  const { organization, settings } = useSnapshot();
  return useMemo(
    () => ({
      ...organization,
      name: settings.orgDisplayName.trim() || organization.name,
    }),
    [organization, settings.orgDisplayName],
  );
}

export function useRepositories(): Repository[] {
  return useSnapshot().repositories;
}

export function useRepositorySearch(search: string): Repository[] {
  const repos = useRepositories();
  return useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter((r) =>
      `${r.owner}/${r.name}`.toLowerCase().includes(q),
    );
  }, [repos, search]);
}

export function useRepoIndex(): Map<string, Repository> {
  const repos = useRepositories();
  return useMemo(() => new Map(repos.map((r) => [r.id, r])), [repos]);
}

export const fullName = (r: Repository) => `${r.owner}/${r.name}`;

/* ── The queue ──────────────────────────────────────────────────────────── */

/** Sitting this long with nobody acting on it is the thing worth surfacing. */
const STALE_DAYS = 3;

const SIZE_BUCKETS: readonly [number, QueueRow["sizeLabel"]][] = [
  [10, "XS"],
  [50, "S"],
  [250, "M"],
  [1000, "L"],
];

function sizeLabel(lines: number): QueueRow["sizeLabel"] {
  for (const [limit, label] of SIZE_BUCKETS) if (lines < limit) return label;
  return "XL";
}

/** The signed-in member, or null when nobody on the roster is marked. */
export function useMe(): Member | null {
  const members = useSnapshot().members;
  return useMemo(() => members.find((m) => m.isYou) ?? null, [members]);
}

/**
 * The team's review queue.
 *
 * Open, non-draft pull requests, each carrying the pre-triage that makes this
 * worth opening instead of GitHub's review tab: Komodo's verdict, how long it
 * has waited, how big it is, and its worst findings.
 */
export function useQueue(query: QueueQuery = {}): QueueRow[] {
  const judgments = useSnapshot().judgments;
  const findings = useSnapshot().findings;
  const repoIndex = useRepoIndex();
  const me = useMe();
  const login = me?.githubLogin ?? null;
  const now = useNow();

  const { lens = "all", search, author, repo } = query;

  return useMemo(() => {
    const bySeverity = { P0: 0, P1: 1, P2: 2 } as const;
    const findingsFor = new Map<string, Finding[]>();
    for (const f of findings) {
      const list = findingsFor.get(f.judgmentId);
      if (list) list.push(f);
      else findingsFor.set(f.judgmentId, [f]);
    }

    const rows: QueueRow[] = [];
    for (const j of judgments) {
      if (j.state !== "open" || j.isDraft) continue;

      const repository = repoIndex.get(j.repoId);
      const changedLines = j.additions + j.deletions;
      const waitingDays = Math.floor((now - j.updatedAt) / DAY_MS);

      // "Asked for and not yet given" — an approval or a changes-requested
      // from me means the ball is back in the author's court.
      const needsMyReview =
        login !== null &&
        j.requestedReviewers.includes(login) &&
        !j.approvals.includes(login) &&
        !j.changesRequested.includes(login);

      rows.push({
        ...j,
        repoFullName: repository ? fullName(repository) : j.repoId,
        changedLines,
        sizeLabel: sizeLabel(changedLines),
        waitingDays,
        needsMyReview,
        isBlocked: j.verdict === "blocked" || j.changesRequested.length > 0,
        isStale: waitingDays >= STALE_DAYS,
        topFindings: (findingsFor.get(j.id) ?? [])
          .filter((f) => f.status === "open")
          .sort((a, b) => bySeverity[a.severity] - bySeverity[b.severity])
          .slice(0, 3),
      });
    }

    const q = (search ?? "").trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (lens === "mine" && !r.needsMyReview) return false;
      if (lens === "blocked" && !r.isBlocked) return false;
      if (lens === "stale" && !r.isStale) return false;
      if (author && r.author !== author) return false;
      if (repo && r.repoFullName !== repo) return false;
      if (q) {
        const haystack = [r.title, r.author, r.repoFullName, `#${r.number}`]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    // Longest wait first: the queue's job is to surface what is going stale,
    // not what landed most recently.
    return filtered.sort((a, b) => a.updatedAt - b.updatedAt);
  }, [judgments, findings, repoIndex, login, now, lens, search, author, repo]);
}

/** Row counts behind each lens, so the tabs can carry a badge. */
export function useQueueCounts(query: Omit<QueueQuery, "lens"> = {}) {
  const all = useQueue({ ...query, lens: "all" });
  return useMemo(
    () => ({
      all: all.length,
      mine: all.filter((r) => r.needsMyReview).length,
      blocked: all.filter((r) => r.isBlocked).length,
      stale: all.filter((r) => r.isStale).length,
    }),
    [all],
  );
}

/* ── Judgments ──────────────────────────────────────────────────────────── */

export function useJudgments(query: JudgmentQuery = {}): Judgment[] {
  const prs = useSnapshot().judgments;
  const repoIndex = useRepoIndex();

  return useMemo(() => {
    const q = (query.search ?? "").trim().toLowerCase();
    const filtered = prs.filter((pr) => {
      if (query.status && pr.status !== query.status) return false;
      if (query.impact && pr.impact !== query.impact) return false;
      if (query.author && pr.author !== query.author) return false;
      if (query.repo) {
        const repo = repoIndex.get(pr.repoId);
        if (!repo || fullName(repo) !== query.repo) return false;
      }
      if (query.confidence && !matchesComparison(pr.score, query.confidence)) {
        return false;
      }
      if (q) {
        const repo = repoIndex.get(pr.repoId);
        const haystack = [
          pr.title,
          pr.author,
          repo ? fullName(repo) : "",
          `#${pr.number}`,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    const dir = query.sort === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => dir * (a.updatedAt - b.updatedAt));
  }, [prs, repoIndex, query.search, query.status, query.impact, query.author, query.repo, query.confidence, query.sort]);
}

/** `> 3`, `>= 3`, `< 3`, `3`. Used by the confidence/usage/acceptance facets. */
export function matchesComparison(value: number, expr: string): boolean {
  const m = expr.trim().match(/^(>=|<=|>|<|=)?\s*(-?\d+(?:\.\d+)?)%?$/);
  if (!m) return true;
  const [, op = "=", raw] = m;
  const n = Number(raw);
  switch (op) {
    case ">": return value > n;
    case ">=": return value >= n;
    case "<": return value < n;
    case "<=": return value <= n;
    default: return value === n;
  }
}

export function useAuthors(): string[] {
  const prs = useSnapshot().judgments;
  return useMemo(
    () => [...new Set(prs.map((p) => p.author))].sort(),
    [prs],
  );
}

/* ── Analytics window ───────────────────────────────────────────────────── */

export interface Window {
  from: number;
  to: number;
}

/** The window a timeframe names, measured from the render's clock. */
export function timeframeWindow(
  timeframe: Timeframe = "this-month",
  now: number,
): Window {
  switch (timeframe) {
    case "all":
      return { from: startOfDay(now - 119 * DAY_MS), to: now };
    case "this-week":
      return { from: startOfWeek(now), to: now };
    case "this-quarter":
      return { from: startOfQuarter(now), to: now };
    case "this-year":
      return { from: startOfYear(now), to: now };
    case "custom":
      return { from: startOfDay(now - 29 * DAY_MS), to: now };
    case "this-month":
    default:
      return { from: startOfMonth(now), to: now };
  }
}

function bucketKey(ts: number, granularity: Granularity): number {
  const day = startOfDay(ts);
  if (granularity === "day") return day;
  if (granularity === "week") {
    const dow = new Date(day).getUTCDay();
    return day - dow * DAY_MS;
  }
  const d = new Date(day);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

function bucketsFor(w: Window, granularity: Granularity): number[] {
  const out: number[] = [];
  let cursor = bucketKey(w.from, granularity);
  const end = bucketKey(w.to, granularity);
  let guard = 0;
  while (cursor <= end && guard++ < 800) {
    out.push(cursor);
    if (granularity === "month") {
      const d = new Date(cursor);
      cursor = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    } else {
      cursor += (granularity === "week" ? 7 : 1) * DAY_MS;
    }
  }
  return out;
}

/**
 * The subset of PRs an analytics query covers. Every panel starts here.
 * `timeframeWindow` returns a fresh object every render, so the window is
 * destructured to primitives before it reaches any dependency array.
 */
function useScopedJudgments(query: AnalyticsQuery) {
  const prs = useSnapshot().judgments;
  const repoIndex = useRepoIndex();
  const { from, to } = timeframeWindow(query.timeframe, useNow());
  const repos = query.repos;
  const authors = query.authors;

  const scoped = useMemo(() => {
    const repoAllow = repos?.length ? new Set(repos) : null;
    const authorAllow = authors?.length ? new Set(authors) : null;
    return prs.filter((pr) => {
      if (pr.updatedAt < from || pr.updatedAt > to) return false;
      if (authorAllow && !authorAllow.has(pr.author)) return false;
      if (repoAllow) {
        const repo = repoIndex.get(pr.repoId);
        if (!repo || !repoAllow.has(fullName(repo))) return false;
      }
      return true;
    });
  }, [prs, repoIndex, from, to, repos, authors]);

  return { scoped, from, to };
}

function useScopedFindings(query: AnalyticsQuery) {
  const findings = useSnapshot().findings;
  const { scoped } = useScopedJudgments(query);
  return useMemo(() => {
    const ids = new Set(scoped.map((p) => p.id));
    return findings.filter((f) => ids.has(f.judgmentId));
  }, [findings, scoped]);
}

/**
 * The rows behind the charts, for anything that needs them as rows.
 *
 * The Export button had nothing to export because the scoped sets were
 * private to this module — the charts consumed them and no one else could.
 * Handing them out costs nothing: they are derived, so an export and the chart
 * above it cannot disagree.
 */
export function useAnalyticsRows(query: AnalyticsQuery): {
  judgments: Judgment[];
  findings: Finding[];
} {
  const { scoped } = useScopedJudgments(query);
  const findings = useScopedFindings(query);
  return useMemo(
    () => ({ judgments: scoped, findings }),
    [scoped, findings],
  );
}

/** The teams komodo.yaml defines, for the analytics scope picker. */
export function useTeams(): Team[] {
  return useSnapshot().teams;
}

/* ── Analytics: PR Reviews tab ──────────────────────────────────────────── */

export function useAnalyticsSummary(query: AnalyticsQuery): AnalyticsSummary {
  const { scoped } = useScopedJudgments(query);
  const findings = useScopedFindings(query);
  return useMemo(() => {
    const merged = scoped.filter((p) => p.mergedAt !== null);
    const totalMergeDays = merged.reduce(
      (sum, p) => sum + (p.mergedAt! - p.createdAt) / DAY_MS,
      0,
    );
    return {
      totalPrs: scoped.length,
      totalReviews: scoped.reduce((s, p) => s + p.reviewCount, 0),
      avgMergeTimeDays: merged.length ? totalMergeDays / merged.length : 0,
      bugsCaught: findings.length,
    };
  }, [scoped, findings]);
}

export type ReviewMetric =
  | "prs-reviewed"
  | "total-reviews"
  | "avg-reviews-per-pr"
  | "median-comments-per-pr"
  | "mean-comments-per-pr";

export const REVIEW_METRIC_LABELS: Record<ReviewMetric, string> = {
  "prs-reviewed": "PRs reviewed",
  "total-reviews": "Total reviews",
  "avg-reviews-per-pr": "Avg reviews / PR",
  "median-comments-per-pr": "Median comments / PR",
  "mean-comments-per-pr": "Mean comments / PR",
};

export const REVIEW_METRIC_AXIS: Record<ReviewMetric, string> = {
  "prs-reviewed": "PRS REVIEWED",
  "total-reviews": "TOTAL REVIEWS",
  "avg-reviews-per-pr": "AVG REVIEWS / PR",
  "median-comments-per-pr": "MEDIAN COMMENTS / PR",
  "mean-comments-per-pr": "MEAN COMMENTS / PR",
};

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function useReviewsSeries(
  query: AnalyticsQuery,
  metric: ReviewMetric,
): SeriesPoint[] {
  const { scoped, from, to } = useScopedJudgments(query);
  const granularity = query.granularity ?? "day";

  return useMemo(() => {
    const buckets = bucketsFor({ from, to }, granularity);
    const grouped = new Map<number, Judgment[]>(
      buckets.map((b) => [b, []]),
    );
    for (const pr of scoped) {
      const key = bucketKey(pr.updatedAt, granularity);
      grouped.get(key)?.push(pr);
    }
    return buckets.map((date) => {
      const rows = grouped.get(date) ?? [];
      const reviewed = rows.filter((r) => r.reviewCount > 0);
      let value = 0;
      switch (metric) {
        case "prs-reviewed":
          value = reviewed.length;
          break;
        case "total-reviews":
          value = rows.reduce((s, r) => s + r.reviewCount, 0);
          break;
        case "avg-reviews-per-pr":
          value = rows.length
            ? rows.reduce((s, r) => s + r.reviewCount, 0) / rows.length
            : 0;
          break;
        case "median-comments-per-pr":
          value = median(rows.map((r) => r.totalComments));
          break;
        case "mean-comments-per-pr":
          value = rows.length
            ? rows.reduce((s, r) => s + r.totalComments, 0) / rows.length
            : 0;
          break;
      }
      return { date, value };
    });
  }, [scoped, from, to, granularity, metric]);
}

export function useBugsSeries(
  query: AnalyticsQuery,
  severity: Severity | "all",
): SeriesPoint[] {
  const findings = useScopedFindings(query);
  const { from, to } = useScopedJudgments(query);
  const granularity = query.granularity ?? "day";

  return useMemo(() => {
    const buckets = bucketsFor({ from, to }, granularity);
    const counts = new Map<number, number>(buckets.map((b) => [b, 0]));
    for (const f of findings) {
      if (severity !== "all" && f.severity !== severity) continue;
      const key = bucketKey(f.createdAt, granularity);
      if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return buckets.map((date) => ({ date, value: counts.get(date) ?? 0 }));
  }, [findings, from, to, granularity, severity]);
}

export function useMergeTimeSeries(
  query: AnalyticsQuery,
  stat: "mean" | "median",
): SeriesPoint[] {
  const { scoped, from, to } = useScopedJudgments(query);
  const granularity = query.granularity ?? "day";

  return useMemo(() => {
    const buckets = bucketsFor({ from, to }, granularity);
    const grouped = new Map<number, number[]>(buckets.map((b) => [b, []]));
    for (const pr of scoped) {
      if (pr.mergedAt === null) continue;
      const key = bucketKey(pr.mergedAt, granularity);
      grouped.get(key)?.push((pr.mergedAt - pr.createdAt) / DAY_MS);
    }
    return buckets.map((date) => {
      const rows = grouped.get(date) ?? [];
      if (!rows.length) return { date, value: 0 };
      const value =
        stat === "median"
          ? median(rows)
          : rows.reduce((s, v) => s + v, 0) / rows.length;
      return { date, value };
    });
  }, [scoped, from, to, granularity, stat]);
}

export function useContributorsSeries(query: AnalyticsQuery): SeriesPoint[] {
  const { scoped, from, to } = useScopedJudgments(query);
  const granularity = query.granularity ?? "day";

  return useMemo(() => {
    const buckets = bucketsFor({ from, to }, granularity);
    const counts = new Map<number, number>(buckets.map((b) => [b, 0]));
    for (const pr of scoped) {
      if (pr.mergedAt === null) continue;
      const key = bucketKey(pr.mergedAt, granularity);
      if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return buckets.map((date) => ({ date, value: counts.get(date) ?? 0 }));
  }, [scoped, from, to, granularity]);
}

export function useAddressedRateSeries(query: AnalyticsQuery): SeriesPoint[] {
  const { scoped, from, to } = useScopedJudgments(query);
  const granularity = query.granularity ?? "day";

  return useMemo(() => {
    const buckets = bucketsFor({ from, to }, granularity);
    const grouped = new Map<number, Judgment[]>(buckets.map((b) => [b, []]));
    for (const pr of scoped) {
      const key = bucketKey(pr.updatedAt, granularity);
      grouped.get(key)?.push(pr);
    }
    return buckets.map((date) => {
      const rows = grouped.get(date) ?? [];
      const total = rows.reduce((s, r) => s + r.totalComments, 0);
      const addressed = rows.reduce((s, r) => s + r.addressedComments, 0);
      return { date, value: total ? (addressed / total) * 100 : 0 };
    });
  }, [scoped, from, to, granularity]);
}

export function useAddressedRateTotals(query: AnalyticsQuery) {
  const { scoped } = useScopedJudgments(query);
  return useMemo(() => {
    const total = scoped.reduce((s, r) => s + r.totalComments, 0);
    const addressed = scoped.reduce((s, r) => s + r.addressedComments, 0);
    return { rate: total ? (addressed / total) * 100 : 0, addressed };
  }, [scoped]);
}

export function useCommentRatings(query: AnalyticsQuery) {
  const { scoped } = useScopedJudgments(query);
  return useMemo(
    () => ({
      upvotes: scoped.reduce((s, r) => s + r.upvotes, 0),
      downvotes: scoped.reduce((s, r) => s + r.downvotes, 0),
    }),
    [scoped],
  );
}

function topN<T>(rows: T[], n: number) {
  return rows.slice(0, n);
}

export function useLeaderboards(query: AnalyticsQuery) {
  const { scoped } = useScopedJudgments(query);
  const findings = useScopedFindings(query);
  const repoIndex = useRepoIndex();

  return useMemo(() => {
    const byRepo = new Map<
      string,
      { reviews: number; mergeDays: number[]; addressed: number; comments: number }
    >();
    for (const pr of scoped) {
      const repo = repoIndex.get(pr.repoId);
      if (!repo) continue;
      const key = fullName(repo);
      const row =
        byRepo.get(key) ??
        { reviews: 0, mergeDays: [], addressed: 0, comments: 0 };
      row.reviews += pr.reviewCount;
      if (pr.mergedAt !== null) {
        row.mergeDays.push((pr.mergedAt - pr.createdAt) / DAY_MS);
      }
      row.addressed += pr.addressedComments;
      row.comments += pr.totalComments;
      byRepo.set(key, row);
    }

    const judgmentById = new Map(scoped.map((p) => [p.id, p]));
    const bugsByRepo = new Map<string, number>();
    for (const f of findings) {
      const pr = judgmentById.get(f.judgmentId);
      if (!pr) continue;
      const repo = repoIndex.get(pr.repoId);
      if (!repo) continue;
      const key = fullName(repo);
      bugsByRepo.set(key, (bugsByRepo.get(key) ?? 0) + 1);
    }

    const byAuthor = new Map<string, number>();
    for (const pr of scoped) {
      if (pr.mergedAt === null) continue;
      byAuthor.set(pr.author, (byAuthor.get(pr.author) ?? 0) + 1);
    }

    const topReposByReviewCount: LeaderRow[] = topN(
      [...byRepo.entries()]
        .filter(([, v]) => v.reviews > 0)
        .sort((a, b) => b[1].reviews - a[1].reviews),
      5,
    ).map(([label, v]) => ({ label, value: String(v.reviews), kind: "repo" }));

    const reposWithMostBugs: LeaderRow[] = topN(
      [...bugsByRepo.entries()].sort((a, b) => b[1] - a[1]),
      5,
    ).map(([label, v]) => ({ label, value: String(v), kind: "repo" }));

    const topReposByMergeTime: LeaderRow[] = topN(
      [...byRepo.entries()]
        .filter(([, v]) => v.mergeDays.length > 0)
        .sort(
          (a, b) =>
            b[1].mergeDays.reduce((s, x) => s + x, 0) / b[1].mergeDays.length -
            a[1].mergeDays.reduce((s, x) => s + x, 0) / a[1].mergeDays.length,
        ),
      5,
    ).map(([label, v]) => ({
      label,
      value: `${(
        v.mergeDays.reduce((s, x) => s + x, 0) / v.mergeDays.length
      ).toFixed(1)}d`,
      kind: "repo",
    }));

    const topContributors: LeaderRow[] = topN(
      [...byAuthor.entries()].sort((a, b) => b[1] - a[1]),
      5,
    ).map(([label, v]) => ({
      label: `@${label}`,
      value: `${v} PR${v === 1 ? "" : "s"}`,
      kind: "user",
    }));

    const topReposByAddressedRate: LeaderRow[] = topN(
      [...byRepo.entries()]
        .filter(([, v]) => v.comments > 0)
        .sort(
          (a, b) =>
            b[1].addressed / b[1].comments - a[1].addressed / a[1].comments,
        ),
      5,
    ).map(([label, v]) => ({
      label,
      value: `${Math.round((v.addressed / v.comments) * 100)}%`,
      kind: "repo",
    }));

    const mostUpvotedComments: LeaderRow[] = topN(
      [...scoped].filter((p) => p.upvotes > 0).sort((a, b) => b.upvotes - a.upvotes),
      5,
    ).map((pr) => ({
      label: pr.title,
      value: `${pr.upvotes}`,
      kind: "repo" as const,
    }));

    return {
      topReposByReviewCount,
      reposWithMostBugs,
      topReposByMergeTime,
      topContributors,
      topReposByAddressedRate,
      mostUpvotedComments,
    };
  }, [scoped, findings, repoIndex]);
}

/* ── Analytics: Bugs Caught tab ─────────────────────────────────────────── */

export function useFindingsSummary(query: AnalyticsQuery): FindingsSummary {
  const findings = useScopedFindings(query);
  return useMemo(
    () => ({
      all: findings.length,
      security: findings.filter((f) => f.isSecurity).length,
      p0: findings.filter((f) => f.severity === "P0").length,
      p1: findings.filter((f) => f.severity === "P1").length,
      p2: findings.filter((f) => f.severity === "P2").length,
    }),
    [findings],
  );
}

export interface FindingRow extends Finding {
  prTitle: string;
  prNumber: number;
  repoFullName: string;
  prUrl: string;
}

export function useFindings(
  query: AnalyticsQuery,
  search: string,
): FindingRow[] {
  const findings = useScopedFindings(query);
  const prs = useSnapshot().judgments;
  const repoIndex = useRepoIndex();

  return useMemo(() => {
    const judgmentById = new Map(prs.map((p) => [p.id, p]));
    const rows: FindingRow[] = [];
    for (const f of findings) {
      const pr = judgmentById.get(f.judgmentId);
      if (!pr) continue;
      const repo = repoIndex.get(pr.repoId);
      rows.push({
        ...f,
        prTitle: pr.title,
        prNumber: pr.number,
        prUrl: pr.url,
        repoFullName: repo ? fullName(repo) : "",
      });
    }
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.title, r.filePath, r.repoFullName, r.prTitle, `#${r.prNumber}`]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [findings, prs, repoIndex, search]);
}

/* ── Memory ─────────────────────────────────────────────────────────────── */

export interface MemoryPage {
  rows: MemoryRuleStats[];
  total: number;
  page: number;
  perPage: number;
  pageCount: number;
}

export function useMemoryRules(query: MemoryQuery = {}): MemoryPage {
  const rules = useSnapshot().memoryRules;
  const repoIndex = useRepoIndex();
  const perPage = query.perPage ?? 10;
  const page = query.page ?? 0;

  return useMemo(() => {
    const q = (query.search ?? "").trim().toLowerCase();
    const filtered = rules.filter((rule) => {
      if (query.type && rule.kind !== query.type) return false;
      if (query.status && rule.status !== query.status) return false;
      if (query.repository) {
        const repo = rule.repoId ? repoIndex.get(rule.repoId) : null;
        if (!repo || fullName(repo) !== query.repository) return false;
      }
      if (query.usage && !matchesComparison(rule.usageCount, query.usage)) {
        return false;
      }
      if (query.acceptance) {
        if (rule.acceptanceRate === null) return false;
        if (!matchesComparison(rule.acceptanceRate, query.acceptance)) {
          return false;
        }
      }
      if (q) {
        const repo = rule.repoId ? repoIndex.get(rule.repoId) : null;
        const haystack = [rule.description, rule.pattern, repo?.name ?? ""]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    const dir = query.sortDir === "asc" ? 1 : -1;
    const sorted = [...filtered].sort((a, b) => {
      switch (query.sortBy) {
        case "usage":
          return dir * (a.usageCount - b.usageCount);
        case "acceptance":
          return dir * ((a.acceptanceRate ?? -1) - (b.acceptanceRate ?? -1));
        case "status":
          return dir * a.status.localeCompare(b.status);
        default:
          return b.updatedAt - a.updatedAt;
      }
    });

    const pageCount = Math.max(1, Math.ceil(sorted.length / perPage));
    const safePage = Math.min(page, pageCount - 1);
    return {
      rows: sorted.slice(safePage * perPage, safePage * perPage + perPage),
      total: sorted.length,
      page: safePage,
      perPage,
      pageCount,
    };
  }, [rules, repoIndex, query.search, query.type, query.status, query.repository, query.usage, query.acceptance, query.sortBy, query.sortDir, page, perPage]);
}

export function useMemoryRule(id: string | null): MemoryRuleStats | null {
  const rules = useSnapshot().memoryRules;
  return useMemo(
    () => (id ? (rules.find((r) => r.id === id) ?? null) : null),
    [rules, id],
  );
}

export function useRepoClusters(): RepoCluster[] {
  return useSnapshot().repoClusters;
}

export function useIntegrations(): Integration[] {
  return useSnapshot().integrations;
}

/* ── Admin ──────────────────────────────────────────────────────────────── */

export function useMembers(search = "", role: string = "all"): Member[] {
  const members = useSnapshot().members;
  return useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      if (role !== "all" && m.role !== role) return false;
      if (q && !m.email.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [members, search, role]);
}

export function useApiKeys(search = ""): ApiKey[] {
  const keys = useSnapshot().apiKeys;
  return useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return keys;
    return keys.filter((k) => k.name.toLowerCase().includes(q));
  }, [keys, search]);
}

/**
 * How this deployment reviews.
 *
 * On the snapshot rather than in local state, because it is not a preference
 * of the browser that opened the page — it is the configuration the ingester
 * runs on. A change here reaches the next poll; a change in localStorage
 * reached nothing.
 */
export function useOrgSettings(): OrgSettings {
  return useSnapshot().settings;
}

/**
 * One person's preferences, plus who they are.
 *
 * The preferences are per-browser and stay in local state. The identity is
 * not: it comes from the roster komodo.yaml defines, so the header shows
 * whoever this deployment is for rather than whoever the fixture named.
 */
export function usePersonalSettings(): PersonalSettings {
  const preferences = useDataStore((s) => s.personalPreferences);
  const me = useMe();
  return useMemo(
    () => ({
      ...preferences,
      name: me?.name ?? "You",
      email: me?.email ?? "",
      githubLogin: me?.githubLogin ?? "",
    }),
    [preferences, me],
  );
}

/* ── Usage ──────────────────────────────────────────────────────────────── */

/** Days of history the usage screen covers. */
const USAGE_DAYS = 30;

/** The window the usage screen reports on, ending at this render's clock. */
export function useUsageWindow(): { from: number; to: number } {
  const now = useNow();
  return useMemo(
    () => ({ from: startOfDay(now - (USAGE_DAYS - 1) * DAY_MS), to: startOfDay(now) }),
    [now],
  );
}

/**
 * Review volume, day by day.
 *
 * Every figure here is counted from the judgments that produced it. It used to
 * be counted from a seeded PRNG — `cliCredits` was literally `next() < 0.1`,
 * a number no event in the system could ever have caused, on a screen whose
 * whole job is to say what was spent. A deployment running on its own
 * subscription has no credits to report; what it has is runs, and those are
 * real.
 */
export function useUsageDays(): UsageDay[] {
  const prs = useSnapshot().judgments;
  const { from, to } = useUsageWindow();

  return useMemo(() => {
    const reviewed = new Map<number, { prs: number; runs: number }>();
    for (const pr of prs) {
      if (pr.reviewCount === 0) continue;
      const day = startOfDay(pr.updatedAt);
      if (day < from || day > to) continue;
      const row = reviewed.get(day) ?? { prs: 0, runs: 0 };
      row.prs++;
      row.runs += pr.reviewCount;
      reviewed.set(day, row);
    }

    const out: UsageDay[] = [];
    for (let d = from; d <= to; d += DAY_MS) {
      const row = reviewed.get(d) ?? { prs: 0, runs: 0 };
      out.push({
        date: d,
        reviews: row.prs,
        codeReviewCredits: row.runs,
        // A run started from a laptop lands in the same store through the same
        // port, and nothing distinguishes it from one the poller started. Until
        // a run records where it came from, this cannot honestly be anything
        // but zero.
        cliCredits: 0,
      });
    }
    return out;
  }, [prs, from, to]);
}
