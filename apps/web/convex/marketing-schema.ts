/**
 * Mirrors src/lib/marketing-types.ts field for field. Change both in the same
 * commit (AGENTS.md rule 3). The app-side tables live in `./schema.ts`; these
 * are the marketing site's, and the two share no tables.
 *
 * The functions are not written yet — see convex/README.md. The names the
 * queries will take are recorded as `convex:` comments in
 * src/lib/data/marketing/queries.ts.
 */
import { defineTable } from "convex/server";
import { v } from "convex/values";

const severity = v.union(
  v.literal("logic"),
  v.literal("security"),
  v.literal("correctness"),
  v.literal("data integrity"),
  v.literal("data loss"),
  v.literal("concurrency"),
  v.literal("performance"),
  v.literal("validation"),
  v.literal("runtime"),
  v.literal("error handling"),
  v.literal("refactoring"),
  v.literal("alignment"),
  v.literal("gpu"),
);

const postCollection = v.union(v.literal("blog"), v.literal("content-library"));

const postCategory = v.union(
  v.literal("product"),
  v.literal("research"),
  v.literal("engineering"),
  v.literal("company"),
  v.literal("guide"),
  v.literal("comparison"),
);

const figureVariant = v.union(
  v.literal("dither"),
  v.literal("contour"),
  v.literal("lissajous"),
  v.literal("wireframe"),
  v.literal("diff"),
  v.literal("graph"),
);

/** The `Block` union from marketing-types.ts. */
const block = v.union(
  v.object({ kind: v.literal("p"), text: v.string() }),
  v.object({ kind: v.literal("h2"), text: v.string() }),
  v.object({ kind: v.literal("h3"), text: v.string() }),
  v.object({ kind: v.literal("ul"), items: v.array(v.string()) }),
  v.object({ kind: v.literal("ol"), items: v.array(v.string()) }),
  v.object({ kind: v.literal("quote"), text: v.string() }),
  v.object({
    kind: v.literal("code"),
    lang: v.string(),
    lines: v.array(v.string()),
  }),
  v.object({
    kind: v.literal("figure"),
    caption: v.string(),
    variant: figureVariant,
  }),
);

const diffLine = v.object({
  no: v.string(),
  sign: v.union(v.literal("+"), v.literal("-")),
  width: v.number(),
});

const stat = v.object({ value: v.string(), label: v.string() });

const fact = v.object({
  value: v.string(),
  label: v.string(),
  icon: v.union(
    v.literal("code"),
    v.literal("trend"),
    v.literal("building"),
    v.literal("git"),
  ),
});

const qa = v.object({ question: v.string(), answer: v.string() });

const testimonial = v.object({
  id: v.string(),
  name: v.string(),
  role: v.string(),
  company: v.string(),
  quote: v.string(),
  monogram: v.string(),
});

const featureSection = v.object({
  eyebrow: v.string(),
  heading: v.string(),
  body: v.string(),
  linkLabel: v.optional(v.string()),
  linkHref: v.optional(v.string()),
  figure: figureVariant,
  flip: v.optional(v.boolean()),
});

const jobSection = v.object({
  heading: v.string(),
  body: v.array(block),
});

const finding = v.object({
  id: v.string(),
  repo: v.string(),
  path: v.string(),
  severity,
  title: v.string(),
  prNumber: v.number(),
  url: v.string(),
  diff: v.array(diffLine),
});

export const marketingTables = {
  posts: defineTable({
    slug: v.string(),
    collection: postCollection,
    title: v.string(),
    dek: v.string(),
    category: postCategory,
    publishedAt: v.number(),
    author: v.string(),
    authorRole: v.string(),
    readingMinutes: v.number(),
    body: v.array(block),
  })
    .index("by_collection_published", ["collection", "publishedAt"])
    .index("by_slug", ["collection", "slug"]),

  findings: defineTable(finding).index("by_repo", ["repo"]),

  repoGroups: defineTable({
    slug: v.string(),
    name: v.string(),
    repo: v.string(),
    stars: v.string(),
    forks: v.string(),
    repositories: v.optional(v.number()),
    tags: v.array(v.string()),
    findings: v.array(finding),
  }).index("by_slug", ["slug"]),

  customers: defineTable({
    slug: v.string(),
    name: v.string(),
    title: v.string(),
    industry: v.string(),
    blurb: v.string(),
    stats: v.array(stat),
    facts: v.array(fact),
    quote: testimonial,
    qa: v.array(qa),
  }).index("by_slug", ["slug"]),

  jobs: defineTable({
    slug: v.string(),
    title: v.string(),
    team: v.string(),
    location: v.string(),
    type: v.string(),
    sections: v.array(jobSection),
  })
    .index("by_slug", ["slug"])
    .index("by_team", ["team"]),

  changelog: defineTable({
    version: v.string(),
    publishedAt: v.number(),
    title: v.string(),
    body: v.string(),
    tags: v.array(v.string()),
  }).index("by_published", ["publishedAt"]),

  testimonials: defineTable(testimonial),

  faqItems: defineTable({
    page: v.union(
      v.literal("home"),
      v.literal("pricing"),
      v.literal("enterprise"),
      v.literal("comparison"),
    ),
    question: v.string(),
    answer: v.string(),
  }).index("by_page", ["page"]),

  plans: defineTable({
    planId: v.union(
      v.literal("starter"),
      v.literal("pro"),
      v.literal("enterprise"),
    ),
    name: v.string(),
    blurb: v.string(),
    price: v.string(),
    priceSuffix: v.optional(v.string()),
    priceNote: v.optional(v.string()),
    cta: v.string(),
    ctaHref: v.string(),
    recommended: v.boolean(),
    features: v.array(v.string()),
  }),

  featurePages: defineTable({
    slug: v.string(),
    navLabel: v.string(),
    title: v.string(),
    heading: v.string(),
    dek: v.string(),
    metaTitle: v.string(),
    metaDescription: v.string(),
    sections: v.array(featureSection),
  }).index("by_slug", ["slug"]),

  statusComponents: defineTable({
    name: v.string(),
    state: v.union(
      v.literal("operational"),
      v.literal("degraded"),
      v.literal("outage"),
      v.literal("maintenance"),
    ),
    uptime: v.array(v.number()),
  }),

  episodes: defineTable({
    number: v.number(),
    title: v.string(),
    guest: v.string(),
    guestRole: v.string(),
    minutes: v.number(),
    publishedAt: v.number(),
    summary: v.string(),
  }).index("by_number", ["number"]),

  benchmarkRows: defineTable({
    tool: v.string(),
    caught: v.number(),
    falsePositives: v.number(),
    medianComments: v.number(),
    isGreptile: v.boolean(),
  }),

  leaderboardPanels: defineTable({
    title: v.string(),
    note: v.string(),
    kind: v.union(v.literal("bars"), v.literal("lines"), v.literal("stack")),
    labels: v.array(v.string()),
    series: v.array(
      v.object({ name: v.string(), values: v.array(v.number()) }),
    ),
  }),

  legalSections: defineTable({
    doc: v.union(
      v.literal("security"),
      v.literal("privacy"),
      v.literal("terms"),
    ),
    sectionId: v.string(),
    heading: v.string(),
    body: v.array(block),
  }).index("by_doc", ["doc"]),

  subprocessors: defineTable({
    name: v.string(),
    purpose: v.string(),
    location: v.string(),
  }),
};
