/**
 * The marketing-site read seam. docs/SPEC-MARKETING.md §M12.1.
 *
 * Components import from here and never from `./seed.ts` (AGENTS.md rule 2).
 * These are plain functions rather than hooks because marketing pages are
 * server components, and a server component cannot call a hook. The `convex:`
 * comment on each export names the Convex function it becomes; keep them
 * accurate, because they are the migration plan.
 *
 * Everything here is read-only. The marketing site has no write paths beyond
 * the contact form, which posts nowhere (§M12.3).
 */

import {
  BENCHMARK_ROWS,
  BRAND_FONTS,
  BRAND_PALETTE,
  CHANGELOG,
  CUSTOMERS,
  EPISODES,
  ENTERPRISE_FAQ,
  COMPARISON_FAQ,
  FEATURE_NAV,
  FEATURE_PAGES,
  FINDINGS,
  FOOTER_COLUMNS,
  HERO_QUOTE,
  HOME_FAQ,
  HOME_FINDINGS,
  JOBS,
  LEADERBOARD,
  LIVE_FINDINGS,
  LOGO_WALL,
  PLANS,
  POSTS,
  PRICING_FAQ,
  PRIVACY_SECTIONS,
  REPO_GROUPS,
  RESOURCE_NAV,
  SECURITY_SECTIONS,
  STAT_BAND,
  STATUS_COMPONENTS,
  SUBPROCESSORS,
  TERMS_SECTIONS,
  TESTIMONIALS,
  TREX_FINDINGS,
} from "./seed";
import type {
  ChangelogEntry,
  Customer,
  FeaturePage,
  Job,
  Post,
  PostCollection,
} from "@/lib/marketing-types";

/* ── Navigation and chrome ──────────────────────────────────── §M2 ── */

/** convex: marketing.nav.features */
export function getFeatureNav() {
  return FEATURE_NAV;
}

/** convex: marketing.nav.resources */
export function getResourceNav() {
  return RESOURCE_NAV;
}

/** convex: marketing.nav.footer */
export function getFooterColumns() {
  return FOOTER_COLUMNS;
}

/* ── Social proof ───────────────────────────── §M4.2, §M4.3, §M4.10 ── */

/** convex: marketing.proof.logos */
export function getLogoWall() {
  return LOGO_WALL;
}

/** convex: marketing.proof.testimonials */
export function getTestimonials() {
  return TESTIMONIALS;
}

/** convex: marketing.proof.heroQuote */
export function getHeroQuote() {
  return HERO_QUOTE;
}

/** convex: marketing.proof.statBand */
export function getStatBand() {
  return STAT_BAND;
}

/* ── Findings and repos ─────────────────────────────── §M4.5, §M6 ── */

/** convex: marketing.findings.list */
export function getFindings() {
  return FINDINGS;
}

/** convex: marketing.findings.byRepoGroup */
export function getRepoGroups() {
  return REPO_GROUPS;
}

/** convex: marketing.findings.homeFeatured */
export function getHomeFindings() {
  return HOME_FINDINGS;
}

/** convex: marketing.findings.runtime */
export function getTrexFindings() {
  return TREX_FINDINGS;
}

/** convex: marketing.findings.live */
export function getLiveFindings() {
  return LIVE_FINDINGS;
}

/* ── Pricing and FAQs ──────────────────────────── §M5, §M4.11, §M7 ── */

/** convex: marketing.pricing.plans */
export function getPlans() {
  return PLANS;
}

/** convex: marketing.faq.byPage */
export function getFaq(page: "home" | "pricing" | "enterprise" | "comparison") {
  switch (page) {
    case "pricing":
      return PRICING_FAQ;
    case "enterprise":
      return ENTERPRISE_FAQ;
    case "comparison":
      return COMPARISON_FAQ;
    default:
      return HOME_FAQ;
  }
}

/* ── Feature pages ──────────────────────────────────────────── §M8 ── */

/** convex: marketing.features.list */
export function getFeaturePages(): FeaturePage[] {
  return FEATURE_PAGES;
}

/** convex: marketing.features.bySlug */
export function getFeaturePage(slug: string): FeaturePage | undefined {
  return FEATURE_PAGES.find((f) => f.slug === slug);
}

/** convex: marketing.features.siblings — the three cross-links at §M8.3. */
export function getSiblingFeatures(slug: string): FeaturePage[] {
  const rest = FEATURE_PAGES.filter((f) => f.slug !== slug);
  const start = FEATURE_PAGES.findIndex((f) => f.slug === slug);
  return Array.from({ length: 3 }, (_, i) => rest[(start + i) % rest.length]);
}

/* ── Posts ──────────────────────────────────────────── §M9.1, §M9.2 ── */

/** convex: marketing.posts.list */
export function getPosts(collection: PostCollection): Post[] {
  return POSTS.filter((post) => post.collection === collection).sort(
    (a, b) => b.publishedAt - a.publishedAt,
  );
}

/** convex: marketing.posts.bySlug */
export function getPost(
  collection: PostCollection,
  slug: string,
): Post | undefined {
  return POSTS.find((p) => p.collection === collection && p.slug === slug);
}

/** convex: marketing.posts.latest — the numbered `LATEST` rail at §M9.1. */
export function getLatestPosts(collection: PostCollection, count = 4): Post[] {
  return getPosts(collection).slice(0, count);
}

/** convex: marketing.posts.related */
export function getRelatedPosts(post: Post, count = 3): Post[] {
  return getPosts(post.collection)
    .filter((p) => p.slug !== post.slug)
    .slice(0, count);
}

/* ── Customers ──────────────────────────────────────────── §M9.3 ── */

/** convex: marketing.customers.list */
export function getCustomers(): Customer[] {
  return CUSTOMERS;
}

/** convex: marketing.customers.bySlug */
export function getCustomer(slug: string): Customer | undefined {
  return CUSTOMERS.find((c) => c.slug === slug);
}

/* ── Careers ────────────────────────────────────────────── §M9.4 ── */

/** convex: marketing.jobs.list */
export function getJobs(): Job[] {
  return JOBS;
}

/** convex: marketing.jobs.byTeam — the grouped `Open Positions` list. */
export function getJobsByTeam(): { team: string; jobs: Job[] }[] {
  const teams: string[] = [];
  for (const job of JOBS) if (!teams.includes(job.team)) teams.push(job.team);
  return teams.map((team) => ({
    team,
    jobs: JOBS.filter((job) => job.team === team),
  }));
}

/** convex: marketing.jobs.bySlug */
export function getJob(slug: string): Job | undefined {
  return JOBS.find((job) => job.slug === slug);
}

/* ── Changelog ──────────────────────────────────────────── §M9.5 ── */

/** convex: marketing.changelog.list */
export function getChangelog(): ChangelogEntry[] {
  return [...CHANGELOG].sort((a, b) => b.publishedAt - a.publishedAt);
}

/* ── Reports, status, podcast, legal ───────────────────── §M10 ── */

/** convex: marketing.benchmarks.rows */
export function getBenchmarkRows() {
  return BENCHMARK_ROWS;
}

/** convex: marketing.leaderboard.panels */
export function getLeaderboard() {
  return LEADERBOARD;
}

/** convex: marketing.status.components */
export function getStatusComponents() {
  return STATUS_COMPONENTS;
}

/** convex: marketing.podcast.episodes */
export function getEpisodes() {
  return EPISODES;
}

/** convex: marketing.legal.sections */
export function getLegalSections(
  doc: "security" | "privacy" | "terms",
) {
  switch (doc) {
    case "privacy":
      return PRIVACY_SECTIONS;
    case "terms":
      return TERMS_SECTIONS;
    default:
      return SECURITY_SECTIONS;
  }
}

/** convex: marketing.legal.subprocessors */
export function getSubprocessors() {
  return SUBPROCESSORS;
}

/* ── Brand guidelines ───────────────────────────────────────── §M10.7 ── */

/** convex: marketing.brand.fonts */
export function getBrandFonts() {
  return BRAND_FONTS;
}

/** convex: marketing.brand.palette */
export function getBrandPalette() {
  return BRAND_PALETTE;
}
