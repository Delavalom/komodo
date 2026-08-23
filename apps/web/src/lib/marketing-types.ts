/**
 * Marketing-site domain model. docs/SPEC-MARKETING.md §M11.
 *
 * Mirrored field for field by `convex/marketing-schema.ts` — change one, change
 * the other in the same commit (AGENTS.md rule 3).
 */

export type Severity =
  | "logic"
  | "security"
  | "correctness"
  | "data integrity"
  | "data loss"
  | "concurrency"
  | "performance"
  | "validation"
  | "runtime"
  | "error handling"
  | "refactoring"
  | "alignment"
  | "gpu";

export type PostCollection = "blog" | "content-library";

export type PostCategory =
  | "product"
  | "research"
  | "engineering"
  | "company"
  | "guide"
  | "comparison";

/** A rendered block in a long-form body. Kept deliberately small: this clone
 *  ships placeholder editorial, not a CMS. */
export type Block =
  | { kind: "p"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "code"; lang: string; lines: string[] }
  | { kind: "figure"; caption: string; variant: FigureVariant };

export type FigureVariant =
  | "dither"
  | "contour"
  | "lissajous"
  | "wireframe"
  | "diff"
  | "graph";

export interface Post {
  slug: string;
  collection: PostCollection;
  title: string;
  dek: string;
  category: PostCategory;
  /** Epoch ms, derived from the pinned NOW — never Date.now(). */
  publishedAt: number;
  author: string;
  authorRole: string;
  readingMinutes: number;
  body: Block[];
}

export interface DiffLine {
  no: string;
  sign: "+" | "-";
  /** Width fraction of the abstracted bar, 0–1. The original renders real code;
   *  we render its silhouette. §M12.3. */
  width: number;
}

export interface Finding {
  id: string;
  repo: string;
  path: string;
  severity: Severity;
  title: string;
  prNumber: number;
  url: string;
  diff: DiffLine[];
}

export interface RepoGroup {
  slug: string;
  name: string;
  repo: string;
  stars: string;
  forks: string;
  repositories?: number;
  tags: string[];
  findings: Finding[];
}

export interface Stat {
  value: string;
  label: string;
}

export interface Fact {
  value: string;
  label: string;
  icon: "code" | "trend" | "building" | "git";
}

export interface QA {
  question: string;
  answer: string;
}

export interface Customer {
  slug: string;
  name: string;
  title: string;
  industry: string;
  blurb: string;
  stats: Stat[];
  facts: Fact[];
  quote: Testimonial;
  qa: QA[];
}

export interface JobSection {
  heading: string;
  body: Block[];
}

export interface Job {
  slug: string;
  title: string;
  team: string;
  location: string;
  type: string;
  sections: JobSection[];
}

export interface ChangelogEntry {
  id: string;
  version: string;
  publishedAt: number;
  title: string;
  body: string;
  tags: string[];
}

export interface Testimonial {
  id: string;
  name: string;
  role: string;
  company: string;
  quote: string;
  /** Two-letter monogram; this repo ships no portrait files. §M12.3. */
  monogram: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface Plan {
  id: "starter" | "pro" | "enterprise";
  name: string;
  blurb: string;
  price: string;
  priceSuffix?: string;
  priceNote?: string;
  cta: string;
  ctaHref: string;
  recommended: boolean;
  features: string[];
}

export type StatusState = "operational" | "degraded" | "outage" | "maintenance";

export interface StatusComponent {
  name: string;
  state: StatusState;
  /** 90 days of uptime, newest last. Values are 0–1. */
  uptime: number[];
}

export interface NavItem {
  label: string;
  href: string;
  description?: string;
  badge?: string;
  external?: boolean;
}

export interface FeatureSection {
  eyebrow: string;
  heading: string;
  body: string;
  linkLabel?: string;
  linkHref?: string;
  figure: FigureVariant;
  /** Which side the figure sits on at desktop width. */
  flip?: boolean;
}

export interface FeaturePage {
  slug: string;
  navLabel: string;
  title: string;
  heading: string;
  dek: string;
  metaTitle: string;
  metaDescription: string;
  sections: FeatureSection[];
}

export interface BenchmarkRow {
  tool: string;
  caught: number;
  falsePositives: number;
  medianComments: number;
  isGreptile: boolean;
}

export interface LeaderboardSeries {
  title: string;
  note: string;
  kind: "bars" | "lines" | "stack";
  labels: string[];
  series: { name: string; values: number[] }[];
}

export interface LegalSection {
  id: string;
  heading: string;
  body: Block[];
}

export interface Episode {
  number: number;
  title: string;
  guest: string;
  guestRole: string;
  minutes: number;
  publishedAt: number;
  summary: string;
}
