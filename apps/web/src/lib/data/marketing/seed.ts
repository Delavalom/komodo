/**
 * Deterministic seed for the marketing site. docs/SPEC-MARKETING.md §M11.
 *
 * Never imported by a component — everything is read through
 * `./queries.ts` (AGENTS.md rule 2). Every random value comes from `rng(seed)`
 * and every timestamp is derived from the pinned `NOW`, so server and client
 * render identical markup (AGENTS.md rule 5).
 *
 * All editorial here is written for this clone. Testimonials, customers and
 * findings are fictional; see §M12.3.
 */

import { DAY_MS, NOW, rng } from "@/lib/utils";
import type {
  BenchmarkRow,
  Block,
  ChangelogEntry,
  Customer,
  Episode,
  FaqItem,
  FeaturePage,
  Finding,
  Job,
  LeaderboardSeries,
  LegalSection,
  NavItem,
  Plan,
  Post,
  RepoGroup,
  Severity,
  Stat,
  StatusComponent,
  Testimonial,
} from "@/lib/marketing-types";

const day = (n: number) => NOW - n * DAY_MS;

const p = (text: string): Block => ({ kind: "p", text });
const h2 = (text: string): Block => ({ kind: "h2", text });
const h3 = (text: string): Block => ({ kind: "h3", text });
const ul = (...items: string[]): Block => ({ kind: "ul", items });

/* ── Navigation ─────────────────────────────────────────────── §M2.2 ── */

export const FEATURE_NAV: NavItem[] = [
  { label: "TREX: Runtime Validation", href: "/trex", badge: "Beta" },
  { label: "Greptile Agent", href: "/agent" },
  { label: "Independence", href: "/independence" },
  { label: "Security Review", href: "/security-check" },
  { label: "Learning & Custom Context", href: "/learning" },
  { label: "Greptile CLI", href: "/cli" },
  { label: "Partners", href: "/partners" },
  { label: "Knowledge Base", href: "/knowledge-base" },
];

export const RESOURCE_NAV: NavItem[] = [
  {
    label: "Docs",
    href: "https://www.greptile.com/docs/introduction",
    description: "Comprehensive documentation and guides",
    external: true,
  },
  {
    label: "Greptile Examples",
    href: "/examples",
    description: "See Greptile catching bugs in large OS repos",
  },
  {
    label: "Contact Sales",
    href: "/contact",
    description: "Schedule a demo with our team",
  },
  {
    label: "Customers",
    href: "/customers",
    description: "Success stories and case studies",
  },
  {
    label: "Benchmarks",
    href: "/benchmarks",
    description: "Performance metrics and comparisons",
  },
  {
    label: "Security",
    href: "/security",
    description: "Security practices and compliance",
  },
];

export const FOOTER_COLUMNS: { heading: string; links: NavItem[] }[] = [
  {
    heading: "Product",
    links: [
      { label: "Enterprise", href: "/enterprise" },
      { label: "Pricing", href: "/pricing" },
      {
        label: "Docs",
        href: "https://www.greptile.com/docs/introduction",
        external: true,
      },
      { label: "API", href: "https://www.greptile.com/docs/api", external: true },
      { label: "Zapier", href: "/partners" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "Examples", href: "/examples" },
      { label: "Careers", href: "/careers" },
      { label: "Blog", href: "/blog" },
      { label: "Changelog", href: "/changelog" },
      { label: "Case Studies", href: "/customers" },
      { label: "Podcast", href: "/podcast" },
      { label: "Brand", href: "/design" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Grepository", href: "/knowledge-base" },
      { label: "Content Library", href: "/content-library" },
      { label: "What is AI Code Review?", href: "/what-is-ai-code-review" },
      {
        label: "Code Review Checklist",
        href: "/content-library/code-review-checklist",
      },
      { label: "Benchmarks", href: "/benchmarks" },
      { label: "Paste a PR", href: "/agent" },
      { label: "Greptile vs CodeRabbit", href: "/greptile-vs-coderabbit" },
      { label: "Greptile vs Bugbot", href: "/greptile-vs-bugbot" },
      { label: "State of AI Coding 2026", href: "/state-of-ai-coding" },
      { label: "For YC Companies", href: "/yc" },
    ],
  },
  {
    heading: "Support",
    links: [
      { label: "Contact Us", href: "/contact" },
      { label: "Security", href: "/security" },
      { label: "Privacy Policy", href: "/security/privacy" },
      { label: "Terms of Service", href: "/terms-of-service" },
      { label: "Report Bugs", href: "/contact" },
    ],
  },
];

/* ── Logo wall ──────────────────────────────────────────────── §M4.2 ──
   The original shows real customer wordmarks. This clone ships no third-party
   marks, so the wall is invented companies set in the site's own type. §M12.3 */

export const LOGO_WALL = [
  "Northbeam",
  "Halyard",
  "Tessellate",
  "Coastline",
  "Ardent",
  "Kilnworks",
  "Perigee",
  "Bramble",
];

/* ── Testimonials ───────────────────────────────────────────── §M12.3 ──
   Fictional people at fictional companies. */

export const TESTIMONIALS: Testimonial[] = [
  {
    id: "t-nadia",
    name: "Nadia Okonjo",
    role: "CTO",
    company: "Northbeam",
    monogram: "NO",
    quote:
      "We had tried three review bots before this one and turned all of them off inside a week. This is the first that reads the rest of the repo before it opens its mouth, and it is the only one nobody has asked me to disable.",
  },
  {
    id: "t-marcus",
    name: "Marcus Vale",
    role: "Eng. Manager",
    company: "Halyard",
    monogram: "MV",
    quote:
      "Review latency used to be the whole story of our cycle time. It now takes minutes instead of a day and a half, and the comments are specific enough that people actually act on them rather than arguing with them.",
  },
  {
    id: "t-priya",
    name: "Priya Raman",
    role: "Tech Lead",
    company: "Tessellate",
    monogram: "PR",
    quote:
      "It levels the team up. Juniors get the review a staff engineer would have written, and the staff engineers get their afternoons back.",
  },
  {
    id: "t-sofia",
    name: "Sofia Brenner",
    role: "CTO",
    company: "Coastline",
    monogram: "SB",
    quote: "It keeps finding things in my own pull requests. Humbling, useful.",
  },
  {
    id: "t-elias",
    name: "Elias Ward",
    role: "CEO",
    company: "Ardent",
    monogram: "EW",
    quote:
      "Genuinely changed how the team ships. If you are on the fence, run it against one busy repo for a week and read the comments.",
  },
  {
    id: "t-june",
    name: "June Hartley",
    role: "CTO",
    company: "Kilnworks",
    monogram: "JH",
    quote:
      "The first reviewer of this kind that gives feedback worth reading. It catches the cross-file mistakes a human skims past, and it explains the blast radius rather than just pointing at the line.",
  },
];

export const HERO_QUOTE = TESTIMONIALS[0];

/* ── Findings ───────────────────────────────────────────────── §M4.5 ──
   Synthetic. Shape is the original's; content and PR numbers are ours, and
   every `SEE PR` link is inert. §M12.3 */

const FINDING_SEED: [string, string, Severity, string][] = [
  ["northbeam/atlas", "src/runtime/device_guard.cc", "gpu", "Unbalanced release wipes the active context"],
  ["northbeam/atlas", "packages/designer/cli/provider_repository.py", "logic", "Deprecation warnings never reach the caller"],
  ["northbeam/atlas", "optimizers/orthogonal/sinkhorn.py", "validation", "Convergence check rejects valid output"],
  ["halyard/openenv", "envs/repl/server/environment.py", "runtime", "Undefined method breaks every step()"],
  ["halyard/openenv", "envs/pathway/models.py", "alignment", "Ground truth leaks through the state endpoint"],
  ["halyard/openenv", "cli/commands/push.py", "error handling", "Push surfaces raw tracebacks to users"],
  ["tessellate/kora", "crates/lib/src/transaction/util.rs", "logic", "Mid-loop overflow leaves orphaned keys"],
  ["tessellate/kora", "crates/lib/src/transaction/parse.rs", "validation", "Empty payload parses as a valid create"],
  ["tessellate/kora", "crates/lib/src/token/token.rs", "security", "Null block id bypasses the staleness guard"],
  ["coastline/metaflow", "plugins/devcontainer/decorator.py", "security", "Home mount defeats the container sandbox"],
  ["coastline/metaflow", "plugins/catch_decorator.py", "logic", "parallel_foreach silently truncates"],
  ["coastline/metaflow", "plugins/metadata/service.py", "performance", "The O(1) fast path is a silent no-op"],
  ["ardent/loader", "src/plugins/loader.ts", "logic", "Closes an undefined fd on the error path"],
  ["ardent/loader", "ui/src/app-chat.ts", "refactoring", "Rename leaves three callers undefined"],
  ["ardent/loader", "src/agents/suppression.ts", "logic", "Aliased providers escape suppression"],
  ["kilnworks/insight", "api/provisioning/views.py", "security", "No auth on the provisioning endpoint"],
  ["kilnworks/insight", "frontend/tags/tagger.ts", "security", "Query injection through a URL parameter"],
  ["kilnworks/insight", "hogai/checkpoint/checkpointer.py", "data integrity", "The security fix is missing from the patch"],
  ["perigee/sim", "packages/pipeline/ingest.ts", "logic", "Pipeline rejects valid document formats"],
  ["perigee/sim", "packages/pipeline/versions.ts", "data integrity", "Stale placeholders orphan document mappings"],
  ["bramble/vault", "server/auth/errors.go", "security", "Error timing discloses admin identity"],
  ["bramble/vault", "server/rollout/variants.go", "logic", "Float precision blocks valid rollout sums"],
  ["bramble/vault", "server/mail/attachments.go", "data integrity", "Attachment-backed bodies silently dropped"],
  ["bramble/vault", "server/forms/session.go", "concurrency", "Race condition closes the form and loses input"],
  ["perigee/sim", "packages/metrics/window.ts", "data integrity", "Slice limit underreports all-time metrics"],
  ["perigee/sim", "packages/flags/guard.ts", "logic", "Partial variant removal bypasses the guard"],
  ["tessellate/helix", "crates/query/planner.rs", "logic", "Intersection picks the wrong driver range"],
  ["halyard/guard", "scripts/deploy/secrets.sh", "security", "Shell expansion escapes the kubectl guard"],
  ["coastline/mods", "src/parse/interval.ts", "correctness", "Unanchored regex misparses multi-digit weeks"],
  ["kilnworks/oagen", "src/generate/scope.ts", "correctness", "Scoped generation leaks sibling models"],
  ["northbeam/graph-rag", "src/query/subtree.rs", "correctness", "Subtree query skips attributes, returns empty"],
  ["ardent/lsm", "src/replay/merge.go", "data loss", "Replay folds a persisted merge twice"],
  ["bramble/arcbox", "src/store/create.go", "concurrency", "Concurrent creates collide and delete the winner"],
];

function buildFindings(): Finding[] {
  const next = rng("marketing:findings");
  return FINDING_SEED.map(([repo, path, severity, title], i) => ({
    id: `f-${i}`,
    repo,
    path,
    severity,
    title,
    prNumber: 1000 + Math.floor(next() * 8000),
    url: "#",
    diff: [
      { no: "01", sign: "-" as const, width: 0.55 + next() * 0.35 },
      { no: "01", sign: "+" as const, width: 0.5 + next() * 0.4 },
      { no: "02", sign: "+" as const, width: 0.3 + next() * 0.35 },
    ],
  }));
}

export const FINDINGS = buildFindings();

/* ── Repo groups ────────────────────────────────────────────── §M6 ── */

const REPO_META: [string, string, string, string, number | undefined, string[]][] =
  [
    ["northbeam-atlas", "Northbeam", "northbeam/atlas", "8.6k", 3, ["ai hardware", "gpu computing"]],
    ["halyard-openenv", "Halyard", "halyard/openenv", "1.8k", undefined, ["open source", "ai agent"]],
    ["tessellate-kora", "Tessellate", "tessellate/kora", "174", undefined, ["blockchain", "rust"]],
    ["coastline-metaflow", "Coastline", "coastline/metaflow", "10.1k", undefined, ["ml framework", "data infrastructure"]],
    ["ardent-loader", "Ardent", "ardent/loader", "369k", undefined, ["open source", "deep learning"]],
    ["kilnworks-insight", "Kilnworks", "kilnworks/insight", "34.3k", undefined, ["open source", "product analytics"]],
  ];

export const REPO_GROUPS: RepoGroup[] = REPO_META.map(
  ([slug, name, repo, stars, repositories, tags]) => {
    const next = rng(`marketing:repo:${slug}`);
    return {
      slug,
      name,
      repo,
      stars,
      forks: `${(0.1 + next() * 2).toFixed(1)}k`,
      repositories,
      tags,
      findings: FINDINGS.filter((f) => f.repo === repo).slice(0, 3),
    };
  },
);

/** The three shown on the home page. §M4.5 */
export const HOME_FINDINGS = REPO_GROUPS.slice(0, 3);

/** The runtime-validation strip and the live feed on /examples. §M6 */
export const TREX_FINDINGS = FINDINGS.slice(27, 33);
export const LIVE_FINDINGS = FINDINGS.slice(18, 27);

/* ── Pricing ────────────────────────────────────────────────── §M5 ── */

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    blurb: "Best for individual developers",
    price: "Free",
    cta: "Get started for free",
    ctaHref: "https://app.greptile.com/signup",
    recommended: false,
    features: [
      "Unlimited repositories",
      "50 credits per month:",
      "1 credit = 1 standard review",
      "3 credits = 1 trex review",
      "1 active developer",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    blurb: "Best for teams",
    price: "$30",
    priceSuffix: "/seat/month",
    priceNote:
      "Each seat includes 50 credits per month. Standard reviews cost 1 credit, TREX reviews cost 3, and extra credits are $1 each.",
    cta: "Start 14 day free trial",
    ctaHref: "https://app.greptile.com/signup",
    recommended: true,
    features: [
      "Unlimited Repositories",
      "50 credits included per seat:",
      "1 credit = 1 standard review",
      "3 credits = 1 trex review",
      "$1 per additional credit",
      "Unlimited Users",
      "Create custom rules",
      "Connect unlimited external apps",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    blurb: "Best for organizations at scale",
    price: "Custom pricing",
    cta: "Talk to Sales",
    ctaHref: "/contact",
    recommended: false,
    features: [
      "Option to self-host in your own infrastructure",
      "Security and compliance",
      "SSO/SAML",
      "GitHub Enterprise support",
      "Dedicated Slack channel for support",
      "Custom invoicing and payment terms",
      "Custom DPA and terms of service",
    ],
  },
];

/* ── FAQs ───────────────────────────────────────────────────── §M4.11 ── */

export const HOME_FAQ: FaqItem[] = [
  {
    question: "How does Greptile pricing work?",
    answer:
      "Starter is free for a single active developer and includes unlimited repositories and 50 credits a month. Pro is $30 per seat per month with 50 credits per seat. One standard review costs a credit, a TREX review costs three, and extra credits are a dollar each.",
  },
  {
    question: "Can Greptile be self-hosted?",
    answer:
      "Yes. Enterprise customers can run Greptile inside their own cloud account, and can point it at their own model providers if they would rather inference never left their perimeter.",
  },
  {
    question: "Are there free trials or discounts available for Greptile?",
    answer:
      "There is a 14-day trial on Pro, no card required. Qualified open-source projects are free, and pre-Series A startups get a standing discount — both are covered on their own pages.",
  },
  {
    question: "What programming languages does Greptile support?",
    answer:
      "Python, JavaScript, TypeScript, Go, Elixir, Java, C, C++, C#, Swift, PHP and Rust are fully supported. Most other languages work, with somewhat lower answer quality.",
  },
  {
    question: "Is Greptile compatible with GitLab?",
    answer:
      "Yes — GitHub, GitLab, GitHub Enterprise and self-hosted installations of either.",
  },
  {
    question: "Can I use Greptile's API for my own product?",
    answer:
      "Yes, with discounted bulk pricing for API use. Get in touch and we will size it with you.",
  },
  {
    question: "What is AI code review?",
    answer:
      "AI code review reads the repository around a change, not just the diff, and uses that context to flag logic, security and style problems and to suggest fixes. There is a longer treatment in our guide to AI code review.",
  },
];

export const PRICING_FAQ: FaqItem[] = [
  {
    question: "How does pricing work for the code review bot?",
    answer:
      "Starter is free for a single active developer with unlimited repositories and 50 credits a month. Pro is $30 per seat per month with 50 credits per seat. A standard review spends one credit, a TREX review spends three, and additional credits are a dollar each.",
  },
  {
    question: "Can I prepay for a discount?",
    answer:
      "Annual and multi-year contracts are priced individually. Talk to sales and we will put a number on it.",
  },
  {
    question: "How do I cancel my subscription?",
    answer:
      "From billing settings, at any time, without talking to anyone. The plan runs to the end of the period you already paid for.",
  },
];

export const ENTERPRISE_FAQ: FaqItem[] = [
  {
    question: "Can Greptile be deployed on-prem?",
    answer:
      "Yes. Enterprise customers with data-residency or compliance constraints can run the whole system inside their own environment, including air-gapped installations.",
  },
  {
    question: "What SCMs do you support?",
    answer:
      "GitHub, GitLab, GitHub Enterprise, and self-hosted GitHub or GitLab.",
  },
  {
    question: "How does Greptile handle large codebases?",
    answer:
      "It builds a graph of the repository — files, symbols, call edges and ownership — and reviews against that graph rather than against the diff alone. Indexing is incremental, so monorepos stay workable.",
  },
  {
    question: "How can we begin our evaluation of Greptile?",
    answer:
      "Start the 14-day trial and point it at one busy repository. If you need longer to evaluate, ask and we will extend it.",
  },
  {
    question: "What programming languages does Greptile support?",
    answer:
      "All the mainstream ones — Python, JavaScript, TypeScript, Go, Java, Ruby, Elixir, Rust, PHP, C and C++ among them.",
  },
];

export const COMPARISON_FAQ: FaqItem[] = [
  {
    question: "How is this measured?",
    answer:
      "Against a fixed set of merged pull requests with known defects, replayed through each tool with default settings. The set, the harness and the raw output are published alongside the numbers.",
  },
  {
    question: "Does comment volume matter?",
    answer:
      "It is the whole game. A reviewer that comments on everything is easy to build and impossible to live with, so we track comments per pull request as carefully as we track catches.",
  },
  {
    question: "Can I run the comparison myself?",
    answer:
      "Yes. Point both tools at the same repository for a week and read the comments side by side — it is more informative than any benchmark.",
  },
];

/* ── Feature pages ──────────────────────────────────────────── §M8 ── */

export const FEATURE_PAGES: FeaturePage[] = [
  {
    slug: "agent",
    navLabel: "Greptile Agent",
    title: "Greptile Agent",
    heading: "The code reviewer that catches real bugs",
    dek: "A swarm of agents reads your pull request against a graph of the whole repository, then comments only where it has something worth saying.",
    metaTitle: "Greptile Agent: Autonomous Code Review With Full Codebase Context",
    metaDescription:
      "Autonomous pull request review with full codebase context, from a graph index of your repository.",
    sections: [
      {
        eyebrow: "[ HOW IT WORKS ]",
        heading: "How it works",
        body: "Indexing builds a graph of files, symbols and call edges. When a pull request opens, parallel agents walk out from the changed lines through that graph, assess the blast radius, and only then decide whether there is anything to say.",
        linkLabel: "See docs",
        linkHref: "https://www.greptile.com/docs/introduction",
        figure: "graph",
      },
      {
        eyebrow: "[ ANATOMY ]",
        heading: "The anatomy of a Greptile PR review",
        body: "Every review opens with a summary of what the change does, then a list of findings ordered by severity, each anchored to a line with the reasoning and a suggested patch. Nothing is posted that the agent cannot point at.",
        figure: "diff",
        flip: true,
      },
      {
        eyebrow: "[ CUSTOM RULES ]",
        heading: "Your house, your rules.",
        body: "Write your standards in plain English, scope them to the paths they apply to, and the reviewer enforces them on every pull request from then on.",
        linkLabel: "Learn more",
        linkHref: "/learning",
        figure: "wireframe",
      },
      {
        eyebrow: "[ CONTROL ]",
        heading: "Customizable to your liking",
        body: "Set severity thresholds, mute whole categories, choose which repositories get reviewed and how loud the agent is allowed to be, from the org level down to a single directory.",
        figure: "contour",
        flip: true,
      },
    ],
  },
  {
    slug: "trex",
    navLabel: "TREX: Runtime Validation",
    title: "TREX",
    heading: "Runtime validation for every pull request",
    dek: "TREX writes and runs tests for each pull request inside a sandbox, so the bugs that only appear when the code actually executes get caught before review ends.",
    metaTitle: "TREX: Autonomous Runtime Validation for Pull Requests",
    metaDescription:
      "TREX runs every pull request in a sandbox, generating and executing tests to catch runtime bugs and missed edge cases.",
    sections: [
      {
        eyebrow: "[ SANDBOX ]",
        heading: "It runs the code, not just reads it",
        body: "Each pull request branch is built and executed in an isolated sandbox with no network egress. Static review tells you what looks wrong; running it tells you what is wrong.",
        figure: "contour",
      },
      {
        eyebrow: "[ TESTGEN ]",
        heading: "Tests written for the change in front of it",
        body: "TREX generates cases aimed at the edges of the diff — the boundary values, the error paths, the states the author did not think to try — and reports the ones that fail with a reproduction.",
        figure: "diff",
        flip: true,
      },
      {
        eyebrow: "[ ARTIFACTS ]",
        heading: "Every failure comes with evidence",
        body: "A failing case ships with its input, its trace and the artifacts the run produced, so triage is reading a report rather than reproducing from scratch.",
        figure: "graph",
      },
    ],
  },
  {
    slug: "cli",
    navLabel: "Greptile CLI",
    title: "Greptile CLI",
    heading: "Code reviews in your terminal",
    dek: "Review a branch before it ever becomes a pull request, from the shell you are already in.",
    metaTitle: "Greptile CLI: Code Reviews in Your Terminal",
    metaDescription:
      "Run a full Greptile review against your working branch from the terminal, before you open a pull request.",
    sections: [
      {
        eyebrow: "[ LOCAL ]",
        heading: "Review code without leaving your terminal",
        body: "Point the CLI at a branch and it runs the same review the bot would run on the pull request, printing findings inline with the paths and lines they belong to.",
        linkLabel: "Read docs",
        linkHref: "https://www.greptile.com/docs/code-review/greptile-cli",
        figure: "wireframe",
      },
      {
        eyebrow: "[ LOOP ]",
        heading: "From review to fix in one loop",
        body: "Hand the findings straight to whichever coding agent you use and let it iterate until the review comes back clean. The loop is the point.",
        figure: "diff",
        flip: true,
      },
      {
        eyebrow: "[ ANATOMY ]",
        heading: "The anatomy of a review",
        body: "Summary, findings by severity, suggested patches, and an exit code you can put in a pre-push hook.",
        figure: "graph",
      },
    ],
  },
  {
    slug: "independence",
    navLabel: "Independence",
    title: "Independence",
    heading: "The independent code validator",
    dek: "Greptile is not tied to a model, an IDE or a coding agent — which is the only way a validation layer stays honest.",
    metaTitle: "Vendor-Agnostic AI Code Review",
    metaDescription:
      "An independent validation layer that works with every model, IDE and coding agent rather than belonging to one.",
    sections: [
      {
        eyebrow: "[ AGENTS ]",
        heading: "Deeply integrated with every coding agent",
        body: "One-click handoff into whichever agent your team uses, carrying the finding, the surrounding context and the suggested fix with it.",
        figure: "graph",
      },
      {
        eyebrow: "[ WHY ]",
        heading: "Why independence matters",
        body: "A reviewer owned by the same vendor as the author has an obvious conflict of interest. Keeping the validation layer separate from the generation layer is what makes the review worth reading.",
        figure: "lissajous",
        flip: true,
      },
      {
        eyebrow: "[ MODELS ]",
        heading: "Every top model, whichever is best this month",
        body: "Model choice is a routing decision made per task and revisited constantly, not a partnership. Your reviews follow the frontier without you doing anything.",
        figure: "contour",
      },
    ],
  },
  {
    slug: "learning",
    navLabel: "Learning & Custom Context",
    title: "Learning & Custom Context",
    heading: "Code reviews that get personalized over time",
    dek: "Greptile reads how your team reviews and gradually starts reviewing the same way.",
    metaTitle: "Learning & Custom Context — AI Code Review That Adapts",
    metaDescription:
      "Custom rules, repository context and continuous learning from your team's own review comments.",
    sections: [
      {
        eyebrow: "[ CONTEXT ]",
        heading: "Full codebase context",
        body: "Reviews are written against a graph of the whole repository and its neighbours, not against the diff in isolation — which is why the cross-file mistakes get caught.",
        figure: "graph",
      },
      {
        eyebrow: "[ CUSTOM RULES ]",
        heading: "Custom rules",
        body: "Standards in plain English, scoped to the paths they apply to. No DSL, no plugin to write.",
        figure: "wireframe",
        flip: true,
      },
      {
        eyebrow: "[ CONFIG ]",
        heading: "Configured in code",
        body: "A `.greptile/` directory in the repository, reviewed like anything else. Existing rule files — AGENTS.md, CLAUDE.md, editor rule files — are picked up automatically.",
        figure: "diff",
      },
      {
        eyebrow: "[ LEARNING ]",
        heading: "Learns from feedback",
        body: "Resolved and dismissed comments are signal. Patterns your team consistently rejects stop being raised; patterns they consistently ask for start being enforced.",
        figure: "contour",
        flip: true,
      },
    ],
  },
  {
    slug: "knowledge-base",
    navLabel: "Knowledge Base",
    title: "Knowledge Base",
    heading: "Self-updating docs for your codebase",
    dek: "The index Greptile reviews against, made readable — and editable — by the people who own the code.",
    metaTitle: "Knowledge Base: Self-Updating Codebase Documentation",
    metaDescription:
      "A living map of your codebase that updates as the code changes and stays readable to humans and agents alike.",
    sections: [
      {
        eyebrow: "[ ANATOMY ]",
        heading: "The anatomy of the knowledge base",
        body: "Services, entry points, data flows and ownership, derived from the graph rather than written by hand — which is why it is still accurate six months later.",
        figure: "graph",
      },
      {
        eyebrow: "[ LIVE ]",
        heading: "Real-time updates, fully editable",
        body: "It follows the default branch. Where the derivation gets something wrong, correct it, and the correction survives the next index.",
        figure: "wireframe",
        flip: true,
      },
      {
        eyebrow: "[ AGENTS ]",
        heading: "Accessible by your agent",
        body: "The same knowledge base is exposed over MCP, so a coding agent can consult it before it writes rather than after it breaks something.",
        figure: "contour",
      },
    ],
  },
  {
    slug: "security-check",
    navLabel: "Security Review",
    title: "Security Review",
    heading: "Security reviews for your PRs",
    dek: "A dedicated pass over each change looking for the classes of bug that turn into incidents.",
    metaTitle: "Security Check: AI-Powered Security Reviews for PRs",
    metaDescription:
      "A dedicated security pass on every pull request — authz gaps, injection, secret handling and unsafe defaults.",
    sections: [
      {
        eyebrow: "[ HOW ]",
        heading: "How the security review works",
        body: "Reachability first: the agent traces whether attacker-controlled input can arrive at the changed code, and only reports what it can actually connect to an entry point.",
        figure: "graph",
      },
      {
        eyebrow: "[ EXAMPLES ]",
        heading: "Examples",
        body: "Missing authorization on a new endpoint, injection through a parameter that used to be internal, a guard clause that a null value walks straight past.",
        figure: "diff",
        flip: true,
      },
    ],
  },
  {
    slug: "partners",
    navLabel: "Partners",
    title: "Partners",
    heading: "Review your code with insider context",
    dek: "Partner APIs supply their own review context, so calls into them are checked against how they actually behave.",
    metaTitle: "Partners — Code Reviews with Insider API Context",
    metaDescription:
      "Partner-supplied context so that calls into third-party APIs are reviewed against real semantics, not guesses.",
    sections: [
      {
        eyebrow: "[ CONTEXT ]",
        heading: "Better reviews for the APIs you use",
        body: "Partners publish the migration notes, deprecations and failure modes their SDK actually has, and reviews of code that calls them get correspondingly sharper.",
        figure: "graph",
      },
      {
        eyebrow: "[ USE CASES ]",
        heading: "Insider context for each use case",
        body: "Payments, auth, storage and messaging each have their own catalogue of ways to hold them wrong. That catalogue is what the review consults.",
        figure: "wireframe",
        flip: true,
      },
    ],
  },
];

/* ── Blog + content library ─────────────────────────────────── §M9 ──
   Placeholder editorial written for this clone. §M12.3 */

function body(intro: string, sections: [string, string][]): Block[] {
  const blocks: Block[] = [p(intro)];
  for (const [heading, text] of sections) {
    blocks.push(h2(heading), p(text));
  }
  blocks.push(
    h2("Where this goes next"),
    p(
      "This entry is placeholder editorial written for a frontend clone. It exists to give the page a realistic shape — a lede, a handful of sections, a closing note — without reproducing anyone else's writing.",
    ),
  );
  return blocks;
}

const BLOG_SEED: [string, string, string, Post["category"], number][] = [
  ["greptile-v5", "Greptile v5", "A rewrite of the review loop around a persistent graph, and what it changed about the comments people actually get.", "product", 6],
  ["model-inversion", "Models are worse at reviewing their own code", "Across a fixed benchmark, every model we tested caught fewer defects in code it had written than in code written by a different model.", "research", 12],
  ["automating-code-validation", "Automating code validation", "Generation got cheap and validation did not. That asymmetry is the whole shape of the problem.", "engineering", 9],
  ["trex-code-execution", "Building TREX: code execution and artifact generation", "What it takes to run an arbitrary pull request safely, and what you get back when you do.", "engineering", 14],
  ["prs-on-openclaw", "A statistical study of pull requests on a very large repo", "Ninety days of pull requests on one enormous open-source project, and what the merge data says about review.", "research", 11],
  ["rise-of-the-overnight-agents", "Rise of the overnight agents", "When the code arrives while you sleep, review stops being a queue and starts being a gate.", "company", 7],
  ["brand-refresh", "Why we refreshed the brand", "Notes on the type stack, the palette, and why nothing in the new design is rounded.", "company", 5],
  ["ai-slopware-future", "Slop is not necessarily the future", "Volume went up. Whether quality goes down is a choice about what you put between the generator and the branch.", "company", 6],
  ["github-ids", "Every GitHub object has two IDs", "A short field note about node IDs, database IDs, and the class of bug that lives between them.", "engineering", 4],
  ["auditor", "The auditor pattern", "A second agent whose only job is to disbelieve the first one.", "engineering", 8],
  ["ai-code-reviews-conflict", "When AI reviewers disagree", "Two reviewers, two verdicts, one merge button. How to resolve it without a coin flip.", "research", 7],
  ["make-llms-shut-up", "How to make a model shut up", "Precision is a product decision. Here is how we tuned for silence.", "engineering", 10],
  ["contentification-of-software", "The contentification of software", "If code is cheap to produce, the scarce thing is the judgement about whether to keep it.", "company", 6],
  ["trex", "Introducing TREX", "Greptile now runs your code.", "product", 5],
  ["greptile-v4", "Greptile v4 and new pricing", "Faster reviews, credit-based pricing, and a free tier for individual developers.", "product", 4],
  ["ai-code-review-bubble", "There is an AI code review bubble", "Most of these tools will not exist in two years. Here is the test that separates them.", "company", 8],
  ["greptile-v3-agentic-code-review", "Greptile v3: an agentic approach", "Moving from one pass over the diff to a swarm that walks the graph.", "product", 9],
  ["sandboxing-agents-at-the-kernel-level", "Sandboxing agents at the kernel level", "What we learned building an execution environment we are willing to point at untrusted branches.", "engineering", 13],
  ["series-a", "Our Series A", "What we are building and who is building it.", "company", 3],
  ["ai-code-review", "What AI code review is actually for", "Not linting, not testing, not a substitute for a human who cares. Something else.", "guide", 9],
  ["semantic-codebase-search", "Semantic codebase search", "Why embeddings alone were never going to be enough for a repository.", "engineering", 10],
  ["two-reviewers", "The second reviewer problem", "Every team has one person who catches everything. What happens when that is a service.", "research", 6],
  ["how-we-engineer", "How we engineer", "Small team, large surface, short feedback loops.", "company", 5],
  ["do-larger-prs-get-merged-faster", "Do larger pull requests get merged faster?", "Counterintuitively, sometimes. The confound is who wrote them.", "research", 8],
];

const LIBRARY_SEED: [string, string, string, number][] = [
  ["best-ai-code-review-tools", "Best AI code review tools in 2026", "What to actually evaluate, and the questions that separate the tools that survive a month from the ones that get switched off.", 14],
  ["ai-coding-tools", "AI coding tools: a guide to every category", "Generators, reviewers, testers, agents and the seams between them.", 18],
  ["14-best-developer-productivity-tools", "Developer productivity tools worth the setup cost", "A short list, chosen for what they remove rather than what they add.", 12],
  ["code-review-checklist", "How to actually think about code reviews: the three-layer checklist", "Correctness, blast radius, and whether the change should exist at all.", 10],
  ["best-code-review-small-teams", "Code review for small teams", "When there are four of you, the reviewer is the bottleneck and the safety net at once.", 9],
  ["best-code-review-github", "Best code review tools for GitHub", "How the integrations differ once you get past the marketing pages.", 11],
  ["coderabbit-alternatives", "CodeRabbit alternatives worth a look", "A comparison written to be useful to someone who has already tried one.", 10],
  ["graphite-code-review-alternatives", "Alternatives to stacked-diff workflows", "Stacking solves queueing. It does not solve review quality.", 9],
  ["best-code-review-gitlab", "Best code review tools for GitLab", "The integration surface is different enough to matter.", 10],
  ["code-quality-tools", "Code quality tools that catch bugs before deploy", "Static analysis, type systems, tests, review — in the order they pay off.", 13],
  ["greptile-martian-code-review-benchmark", "Reading a third-party code review benchmark", "How to tell whether a benchmark is measuring catches or measuring noise.", 8],
];

export const POSTS: Post[] = [
  ...BLOG_SEED.map(([slug, title, dek, category, readingMinutes], i) => ({
    slug,
    collection: "blog" as const,
    title,
    dek,
    category,
    publishedAt: day(i * 13 + 2),
    author: ["Nadia Okonjo", "Marcus Vale", "Priya Raman", "June Hartley"][i % 4],
    authorRole: ["Engineering", "Research", "Product", "Engineering"][i % 4],
    readingMinutes,
    body: body(dek, [
      ["The setup", "Every interesting problem in this area starts the same way: the volume of change went up faster than the capacity to check it, and the checking is where the value now sits."],
      ["What we measured", "We held the repository fixed, replayed a known set of merged changes, and counted what each configuration caught, what it missed, and how much it said along the way."],
      ["What surprised us", "The precision ceiling moved more than the recall ceiling. Finding more is easy; finding more without saying more is the hard part."],
    ]),
  })),
  ...LIBRARY_SEED.map(([slug, title, dek, readingMinutes], i) => ({
    slug,
    collection: "content-library" as const,
    title,
    dek,
    category: (i % 3 === 0 ? "comparison" : "guide") as Post["category"],
    publishedAt: day(i * 19 + 5),
    author: ["Priya Raman", "Marcus Vale", "June Hartley"][i % 3],
    authorRole: "Product",
    readingMinutes,
    body: body(dek, [
      ["What to evaluate", "Start with precision. A reviewer that comments on everything is indistinguishable from no reviewer at all after the second week, because people stop reading it."],
      ["What to ignore", "Supported-language lists. Almost everything supports almost everything; the differences are in how much of the repository the tool reads before it forms an opinion."],
      ["How to run the trial", "One busy repository, two weeks, and one honest question at the end: did anyone turn it off?"],
    ]),
  })),
];

/* ── Customers ──────────────────────────────────────────────── §M9.3 ──
   Fictional companies and fictional numbers. §M12.3 */

const CUSTOMER_SEED: [string, string, string, string][] = [
  ["northbeam", "Northbeam", "How Northbeam keeps a decade-old monorepo honest", "Fintech"],
  ["halyard", "Halyard", "How Halyard cut review latency from days to minutes", "Developer tools"],
  ["tessellate", "Tessellate", "How Tessellate reviews infrastructure changes it cannot roll back", "Infrastructure"],
  ["coastline", "Coastline", "How Coastline onboards engineers into an unfamiliar codebase", "Healthcare"],
];

export const CUSTOMERS: Customer[] = CUSTOMER_SEED.map(
  ([slug, name, title, industry], i) => {
    const next = rng(`marketing:customer:${slug}`);
    return {
      slug,
      name,
      title,
      industry,
      blurb: `${name} runs a large shared codebase with more contributors than reviewers, which is the situation this tool was built for.`,
      stats: [
        {
          value: String(800 + Math.floor(next() * 2400)),
          label: "Issues caught per month",
        },
        {
          value: `${100 + Math.floor(next() * 400)}+`,
          label: "Engineers",
        },
      ] as Stat[],
      facts: [
        { value: `${3 + i} languages`, label: "Tech Stack", icon: "code" as const },
        { value: ["Series D", "Series B", "Series C", "Series A"][i], label: "Series", icon: "trend" as const },
        { value: industry, label: "Industry", icon: "building" as const },
        { value: ["GHES", "GitHub", "GitLab", "GitHub"][i], label: "Git Platform", icon: "git" as const },
      ],
      quote: TESTIMONIALS[i],
      qa: [
        {
          question: "What did review look like before?",
          answer:
            "A queue. Changes waited on whichever two people had the context to review them, and those two people spent most of their week reviewing instead of building.",
        },
        {
          question: "What changed first?",
          answer:
            "Latency. The first pass now arrives within minutes of the pull request opening, which means the author is still holding the change in their head when the feedback lands.",
        },
        {
          question: "What convinced the sceptics?",
          answer:
            "A cross-file bug in a path nobody had looked at in a year. It was the kind of thing that would have been a Friday incident.",
        },
      ],
    };
  },
);

/* ── Careers ────────────────────────────────────────────────── §M9.4 ── */

const JOB_SEED: [string, string, string][] = [
  ["frontend-engineer", "Frontend Engineer", "Engineering"],
  ["design-engineer", "Design Engineer", "Engineering"],
  ["infrastructure-engineer", "Infrastructure Engineer", "Engineering"],
  ["generalist-engineer", "Generalist Engineer", "Engineering"],
  ["research-engineer", "Research Engineer", "Engineering"],
  ["growth-engineer", "Growth Engineer", "Engineering"],
  ["forward-deployed-engineer", "Forward Deployed Engineer", "Field"],
  ["customer-engineer", "Customer Engineer", "Field"],
  ["enterprise-account-executive", "Enterprise Account Executive", "Go to market"],
  ["mid-market-account-executive", "Mid-Market Account Executive", "Go to market"],
  ["developer-advocate", "Developer Advocate", "Go to market"],
  ["product-marketing-manager", "Product Marketing Manager", "Go to market"],
  ["product-manager", "Product Manager", "Product"],
  ["brand-designer", "Brand Designer", "Design"],
  ["head-of-people", "Head of People", "Operations"],
  ["people-operations", "People Operations", "Operations"],
];

export const JOBS: Job[] = JOB_SEED.map(([slug, title, team]) => ({
  slug,
  title,
  team,
  location: "San Francisco",
  type: "Full-time · On-site",
  sections: [
    {
      heading: "Problems we're excited about",
      body: [
        p(
          "Reviewing code well requires understanding a codebase well, and understanding a codebase is not a solved problem at any scale that matters. Most of the interesting work here sits in that gap.",
        ),
      ],
    },
    {
      heading: "Trajectory",
      body: [
        p(
          "Small team, large surface. Whatever you join to do, you should expect the shape of the role to change twice in the first year as the product does.",
        ),
      ],
    },
    {
      heading: "Team",
      body: [
        p(
          "We work in person, we ship most days, and we keep the loop between deciding something and seeing whether it was right as short as we can make it.",
        ),
      ],
    },
    {
      heading: "Responsibilities",
      body: [
        ul(
          "Own a surface end to end, from the decision through to what it looks like in production.",
          "Read a lot of code that you did not write, including other people's pull requests.",
          "Talk to the people using the thing you built, directly and often.",
          "Keep the quality bar where it is when it would be faster not to.",
        ),
      ],
    },
    {
      heading: "Qualifications",
      body: [
        ul(
          "You have shipped something people used and can talk about what was wrong with it.",
          "You are comfortable being the person who does not know yet, in public.",
          "You would rather cut scope than cut care.",
        ),
      ],
    },
    {
      heading: "You will like this role if",
      body: [
        ul(
          "You want a short distance between your work and its consequences.",
          "You like problems where the right answer is not written down anywhere.",
          "You would enjoy working next to people who are better than you at something.",
        ),
      ],
    },
    {
      heading: "How to apply",
      body: [
        p(
          "Send something you have built and a paragraph about the hardest decision in it. That is a more useful signal than a résumé, and we read all of them.",
        ),
      ],
    },
  ],
}));

/* ── Changelog ──────────────────────────────────────────────── §M9.5 ── */

const CHANGELOG_SEED: [string, string, string, string[]][] = [
  ["v5.0", "Greptile v5", "The review loop now runs against a persistent graph that survives between reviews, which makes follow-up passes both faster and better informed.", ["product"]],
  ["v4.9", "Security Agent", "A dedicated security pass with reachability analysis, so findings come with a path from an entry point rather than a guess.", ["security"]],
  ["v4.8", "Model Inversion", "Review routing now avoids grading a model's own output wherever the authorship is known.", ["research"]],
  ["v4.7", "CLI Onboarding", "Onboard a repository from the terminal, including the first index, without opening the dashboard.", ["cli"]],
  ["v4.6", "Free Tier for Individual Developers", "Unlimited repositories and 50 credits a month for a single active developer.", ["pricing"]],
  ["v4.5", "Auto-approve PRs", "Changes that clear every configured rule can be approved automatically, with the policy scoped per repository.", ["product"]],
  ["v4.4", "Partner Program", "Partner-supplied API context now feeds reviews of code that calls those APIs.", ["partners"]],
  ["v4.3", "TREX", "Runtime validation in a sandbox, generally available on Pro.", ["trex"]],
  ["v4.2", "Greptile CLI", "Review a working branch before it becomes a pull request.", ["cli"]],
  ["v4.1", "Repo Clusters", "Group related repositories so reviews can read across service boundaries.", ["product"]],
  ["v4.0", "Directory-scoped configuration", "A .greptile/ directory can now be scoped per path, so each team owns its own review settings.", ["product"]],
  ["v3.9", "Memory and Learning", "Dismissed and resolved comments now feed back into what gets raised.", ["learning"]],
  ["v3.8", "Flex Usage Limits", "Soft limits with overage instead of hard stops mid-month.", ["pricing"]],
  ["v3.7", "Redesigned Web App", "New dashboard, new analytics, new memory browser.", ["product"]],
  ["v3.6", "Multi-Repo Context", "Reviews can pull context from adjacent repositories in the same org.", ["product"]],
  ["v3.5", "Security Review Beta", "First version of the dedicated security pass.", ["security"]],
  ["v3.4", "Fix with your Agent", "One-click handoff of a finding, with context, into your coding agent.", ["integrations"]],
  ["v3.3", "Severity Badges", "Findings now carry an explicit severity, and thresholds are configurable.", ["product"]],
];

export const CHANGELOG: ChangelogEntry[] = CHANGELOG_SEED.map(
  ([version, title, body, tags], i) => ({
    id: `c-${i}`,
    version,
    title,
    body,
    tags,
    publishedAt: day(i * 17 + 3),
  }),
);

/* ── Benchmarks + leaderboard ───────────────────────── §M10.2, §M10.3 ──
   Invented numbers. §M12.3 */

export const BENCHMARK_ROWS: BenchmarkRow[] = [
  { tool: "Greptile", caught: 78, falsePositives: 9, medianComments: 4, isGreptile: true },
  { tool: "Reviewer B", caught: 61, falsePositives: 24, medianComments: 11, isGreptile: false },
  { tool: "Reviewer C", caught: 54, falsePositives: 31, medianComments: 17, isGreptile: false },
  { tool: "Reviewer D", caught: 47, falsePositives: 19, medianComments: 8, isGreptile: false },
  { tool: "Baseline linter", caught: 12, falsePositives: 6, medianComments: 3, isGreptile: false },
];

const MONTHS = ["Mar", "Apr", "May", "Jun", "Jul", "Aug"];

function series(seed: string, n: number, lo: number, hi: number): number[] {
  const next = rng(seed);
  return Array.from({ length: n }, () => lo + Math.round(next() * (hi - lo)));
}

export const LEADERBOARD: LeaderboardSeries[] = [
  {
    title: "Agent-written PR share",
    note: "Share of pull requests opened by a coding agent rather than a person.",
    kind: "lines",
    labels: MONTHS,
    series: [
      { name: "Agent-authored", values: series("lb:agent", 6, 18, 62) },
      { name: "Human-authored", values: series("lb:human", 6, 38, 82) },
    ],
  },
  {
    title: "Revert-rate leaderboard",
    note: "Share of merged pull requests reverted within seven days.",
    kind: "bars",
    labels: ["Agent A", "Agent B", "Agent C", "Agent D", "Human"],
    series: [{ name: "Revert rate", values: series("lb:revert", 5, 2, 14) }],
  },
  {
    title: "PR size, same developers",
    note: "Median lines changed, holding the author population fixed.",
    kind: "lines",
    labels: MONTHS,
    series: [{ name: "Median LOC", values: series("lb:size", 6, 60, 340) }],
  },
  {
    title: "Reverts by PR size",
    note: "Revert rate bucketed by lines changed.",
    kind: "bars",
    labels: ["<50", "50–150", "150–400", "400–1k", ">1k"],
    series: [{ name: "Revert rate", values: series("lb:revsize", 5, 3, 21) }],
  },
  {
    title: "Seven-day file churn",
    note: "Share of files touched again within a week of merging.",
    kind: "lines",
    labels: MONTHS,
    series: [{ name: "Churn", values: series("lb:churn", 6, 12, 44) }],
  },
  {
    title: "Review findings by severity",
    note: "Distribution of findings raised across the sample.",
    kind: "stack",
    labels: ["Critical", "High", "Medium", "Low"],
    series: [{ name: "Findings", values: series("lb:sev", 4, 60, 900) }],
  },
  {
    title: "Review cycles by LOC",
    note: "Median review rounds before merge.",
    kind: "bars",
    labels: ["<50", "50–150", "150–400", "400–1k", ">1k"],
    series: [{ name: "Cycles", values: series("lb:cycles", 5, 1, 6) }],
  },
  {
    title: "Cycles by author",
    note: "Review rounds, agent-authored versus human-authored.",
    kind: "bars",
    labels: ["Agent", "Human"],
    series: [{ name: "Cycles", values: series("lb:cyclesauthor", 2, 2, 5) }],
  },
  {
    title: "Failure fingerprints",
    note: "Most common defect classes in agent-authored changes.",
    kind: "bars",
    labels: ["Logic", "Contract", "Concurrency", "Security", "Perf"],
    series: [{ name: "Share", values: series("lb:fingerprint", 5, 6, 34) }],
  },
];

/* ── Status ─────────────────────────────────────────────────── §M10.8 ── */

const STATUS_NAMES = [
  "Web application",
  "Review pipeline",
  "Indexing",
  "TREX sandbox",
  "API",
  "Webhooks",
  "Model routing",
];

export const STATUS_COMPONENTS: StatusComponent[] = STATUS_NAMES.map((name) => {
  const next = rng(`marketing:status:${name}`);
  return {
    name,
    state: "operational" as const,
    uptime: Array.from({ length: 90 }, () => (next() > 0.985 ? 0.94 : 1)),
  };
});

/* ── Podcast ────────────────────────────────────────────────── §M10.10 ── */

export const EPISODES: Episode[] = [
  ["Reviewing what you did not write", "Nadia Okonjo", "CTO, Northbeam"],
  ["The cost of a false positive", "Marcus Vale", "Eng. Manager, Halyard"],
  ["Monorepos, ten years in", "Priya Raman", "Tech Lead, Tessellate"],
  ["What breaks at a thousand engineers", "June Hartley", "CTO, Kilnworks"],
  ["Sandboxing untrusted branches", "Elias Ward", "CEO, Ardent"],
  ["When the reviewer is the bottleneck", "Sofia Brenner", "CTO, Coastline"],
].map(([title, guest, guestRole], i) => ({
  number: 12 - i,
  title,
  guest,
  guestRole,
  minutes: 38 + ((i * 7) % 25),
  publishedAt: day(i * 14 + 4),
  summary:
    "A conversation about how review actually works inside a team that ships a lot, and what stopped working as the team grew.",
}));

/* ── Legal / document pages ─────────────────────────────────── §M10.6 ── */

export const SECURITY_SECTIONS: LegalSection[] = [
  {
    id: "hosting",
    heading: "Hosting and Architecture",
    body: [
      h3("Cloud-based (hosted) services"),
      p("The hosted product runs in a single cloud region with per-tenant isolation at the storage layer and no shared compute between customers."),
      h3("On-premises (self-hosted) services"),
      p("Enterprise customers may run the full system inside their own account, including in air-gapped environments, with no outbound connection required for review to function."),
      h3("Large Language Model inference"),
      p("Inference runs through providers under zero-retention terms, or against a customer's own endpoints where they prefer that."),
      h3("Storage of customer code"),
      p("Source is held only as long as the index requires and is removed when a repository is disconnected."),
    ],
  },
  {
    id: "ml",
    heading: "Machine Learning and Data Usage",
    body: [
      h3("De-identified data and model training"),
      p("Customer source is not used to train models. Aggregate, de-identified signals about review quality are used to tune routing and thresholds."),
      h3("Opting out"),
      p("Organisations can opt out of aggregate signal collection entirely from settings, with no change in product behaviour."),
    ],
  },
  {
    id: "controls",
    heading: "Confidentiality and Security Controls",
    body: [
      h3("Confidentiality"),
      p("Access to production is role-scoped, reviewed quarterly, and logged. Customer data is reachable only through audited paths."),
      h3("Return and deletion of customer data"),
      p("Deletion requests are honoured within thirty days across primary storage and backups."),
    ],
  },
  {
    id: "monitoring",
    heading: "Monitoring and Validation",
    body: [
      h3("Certificates"),
      p("SOC 2 Type II. Reports are available under NDA on request."),
      h3("Audits"),
      p("Independent penetration testing annually, with remediation tracked to closure."),
      h3("Personnel"),
      p("Background checks on hire and annual security training for everyone with production access."),
    ],
  },
];

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    id: "collect",
    heading: "What we collect",
    body: [
      p("Account details, repository metadata needed to run reviews, and product telemetry about how the application is used."),
    ],
  },
  {
    id: "use",
    heading: "How we use it",
    body: [
      p("To provide the service, to support you when something breaks, and to understand which parts of the product are worth continuing to build."),
    ],
  },
  {
    id: "share",
    heading: "Who we share it with",
    body: [
      p("Subprocessors necessary to run the service, listed on the subprocessors page, under contractual confidentiality obligations."),
    ],
  },
  {
    id: "rights",
    heading: "Your rights",
    body: [
      p("Access, correction, export and deletion, exercised from account settings or by writing to us."),
    ],
  },
  {
    id: "contact",
    heading: "Contacting us",
    body: [p("Questions about this policy go to the contact form, and reach a person.")],
  },
];

export const TERMS_SECTIONS: LegalSection[] = [
  {
    id: "agreement",
    heading: "The agreement",
    body: [p("These terms govern use of the service. Using it means accepting them.")],
  },
  {
    id: "accounts",
    heading: "Accounts",
    body: [p("You are responsible for what happens under your account and for keeping credentials secure.")],
  },
  {
    id: "acceptable-use",
    heading: "Acceptable use",
    body: [
      p("Do not use the service to break the law, to attack anyone, or to process code you have no right to process."),
    ],
  },
  {
    id: "billing",
    heading: "Billing",
    body: [p("Paid plans bill in advance and renew until cancelled. Cancellation takes effect at the end of the paid period.")],
  },
  {
    id: "ip",
    heading: "Intellectual property",
    body: [p("Your code stays yours. The service stays ours. Neither party gains rights in the other's material by using it.")],
  },
  {
    id: "termination",
    heading: "Termination",
    body: [p("Either side may end the agreement. On termination, access stops and customer data is deleted on the schedule in the security policy.")],
  },
  {
    id: "liability",
    heading: "Liability",
    body: [p("Liability is limited to amounts paid in the preceding twelve months, to the extent the law allows.")],
  },
];

export const SUBPROCESSORS: {
  name: string;
  purpose: string;
  location: string;
}[] = [
  { name: "Cloud infrastructure provider", purpose: "Hosting and compute", location: "United States" },
  { name: "Managed database provider", purpose: "Primary data storage", location: "United States" },
  { name: "Model inference provider", purpose: "Review generation", location: "United States" },
  { name: "Object storage provider", purpose: "Index and artifact storage", location: "United States" },
  { name: "Error monitoring provider", purpose: "Application monitoring", location: "United States" },
  { name: "Support desk provider", purpose: "Customer support", location: "United States" },
  { name: "Billing provider", purpose: "Payment processing", location: "United States" },
];

/* ── Shared stat band ───────────────────────────────── §M7, §M9.3 ── */

export const STAT_BAND: Stat[] = [
  { value: "3B", label: "Lines of code reviewed / month" },
  { value: "1M", label: "PRs reviewed / month" },
  { value: "22,000+", label: "Teams use Greptile" },
  { value: "500k", label: "Addressed issues / month" },
];

/* ── Brand guidelines ───────────────────────────────────────── §M10.7 ──
   The palette the rest of the site is built from, kept here so /design and
   globals.css cannot drift apart. Values mirror docs/SPEC-MARKETING.md §M1.2. */

export const BRAND_FONTS: {
  name: string;
  role: string;
  token: string;
  className: string;
}[] = [
  {
    name: "DM Sans",
    role: "Body text, paragraphs, UI elements",
    token: "--font-dm-sans",
    className: "font-sans",
  },
  {
    name: "Anybody",
    role: "Headings, display type",
    token: "--font-anybody",
    className: "font-display",
  },
  {
    name: "Space Mono",
    role: "Labels, badges, monospace, technical content",
    token: "--font-space-mono",
    className: "font-label",
  },
];

export const BRAND_PALETTE: {
  group: string;
  swatches: { name: string; hex: string }[];
}[] = [
  {
    group: "Primary",
    swatches: [
      { name: "True Black", hex: "#2A2A2A" },
      { name: "White", hex: "#FEFEFE" },
      { name: "Greptile Green", hex: "#28E99F" },
    ],
  },
  {
    group: "Neutrals",
    swatches: [
      { name: "Basalt", hex: "#3D3B4F" },
      { name: "Eggshell", hex: "#D6D6D6" },
      { name: "Sandbank", hex: "#EEEEEE" },
    ],
  },
  {
    group: "Blues",
    swatches: [
      { name: "Tree Frog", hex: "#756CF5" },
      { name: "Pond", hex: "#5882FF" },
      { name: "Sky", hex: "#71ADFF" },
      { name: "Morning Dew", hex: "#D1E5FF" },
      { name: "Shale", hex: "#A1C1DA" },
    ],
  },
  {
    group: "Greens",
    swatches: [
      { name: "Lichen", hex: "#C5FFD6" },
      { name: "Moss", hex: "#C8EAD0" },
      { name: "Gecko", hex: "#DAFF01" },
      { name: "Pollen", hex: "#ECFFA3" },
    ],
  },
  {
    group: "Warms",
    swatches: [
      { name: "Newt", hex: "#FF7F59" },
      { name: "Bloom", hex: "#FF6D6D" },
      { name: "Orchid", hex: "#FFACFE" },
      { name: "Clay", hex: "#FFBCB3" },
      { name: "Axolotl", hex: "#FFCFFE" },
    ],
  },
];
