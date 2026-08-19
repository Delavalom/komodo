/**
 * Mirrors src/lib/types.ts. Change both in the same commit.
 *
 * The one deliberate divergence: `pullRequests` holds git facts and
 * `judgments` holds Komodo's verdict on them, while the client sees a single
 * flat `Judgment` — the joined shape `api.judgments.list` will return.
 *
 * The functions are not written yet — see convex/README.md.
 */
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const impact = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("critical"),
);

const reviewStatus = v.union(
  v.literal("completed"),
  v.literal("pending"),
  v.literal("skipped"),
  v.literal("error"),
  v.literal("trial_ended"),
  v.literal("usage_limit"),
);

const severity = v.union(v.literal("P0"), v.literal("P1"), v.literal("P2"));

const verdict = v.union(
  v.literal("ship"),
  v.literal("ship_with_notes"),
  v.literal("needs_work"),
  v.literal("blocked"),
);

const memberRole = v.union(v.literal("admin"), v.literal("member"));

const integrationStatus = v.union(
  v.literal("connected"),
  v.literal("not_configured"),
  v.literal("error"),
);

const sectionConfig = v.object({
  enabled: v.boolean(),
  collapsible: v.boolean(),
  defaultOpen: v.boolean(),
});

export default defineSchema({
  organizations: defineTable({
    slug: v.string(),
    name: v.string(),
    role: memberRole,
    trialEndsAt: v.number(),
    plan: v.union(v.literal("trial"), v.literal("pro"), v.literal("enterprise")),
  }).index("by_slug", ["slug"]),

  repositories: defineTable({
    orgId: v.id("organizations"),
    owner: v.string(),
    name: v.string(),
    provider: v.union(v.literal("github"), v.literal("gitlab")),
    enabled: v.boolean(),
    reviewCount: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_org_name", ["orgId", "owner", "name"]),

  // Git facts only. Nothing here is Komodo's opinion.
  pullRequests: defineTable({
    orgId: v.id("organizations"),
    repoId: v.id("repositories"),
    number: v.number(),
    title: v.string(),
    author: v.string(),
    url: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    mergedAt: v.union(v.number(), v.null()),
  })
    .index("by_org_updated", ["orgId", "updatedAt"])
    .index("by_repo", ["repoId"]),

  // The verdict a human reads instead of the diff. One per review of a PR.
  judgments: defineTable({
    orgId: v.id("organizations"),
    prId: v.id("pullRequests"),
    verdict: v.union(verdict, v.null()),
    status: reviewStatus,
    impact,
    score: v.number(),
    reviewCount: v.number(),
    addressedComments: v.number(),
    totalComments: v.number(),
    upvotes: v.number(),
    downvotes: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org_updated", ["orgId", "updatedAt"])
    .index("by_pr", ["prId"]),

  findings: defineTable({
    orgId: v.id("organizations"),
    judgmentId: v.id("judgments"),
    title: v.string(),
    body: v.string(),
    severity,
    isSecurity: v.boolean(),
    status: v.union(
      v.literal("open"),
      v.literal("addressed"),
      v.literal("dismissed"),
    ),
    filePath: v.string(),
    createdAt: v.number(),
  })
    .index("by_org_created", ["orgId", "createdAt"])
    .index("by_judgment", ["judgmentId"]),

  memoryRules: defineTable({
    orgId: v.id("organizations"),
    description: v.string(),
    kind: v.union(v.literal("rule"), v.literal("file")),
    pattern: v.string(),
    files: v.array(
      v.object({
        path: v.string(),
        uses: v.number(),
        repoFullName: v.string(),
      }),
    ),
    repoId: v.union(v.id("repositories"), v.null()),
    fileGlob: v.string(),
    status: v.union(v.literal("active"), v.literal("inactive")),
    usageCount: v.number(),
    usesThisMonth: v.number(),
    acceptanceRate: v.union(v.number(), v.null()),
    upvotes: v.number(),
    downvotes: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org_updated", ["orgId", "updatedAt"])
    .index("by_org_status", ["orgId", "status"]),

  repoClusters: defineTable({
    orgId: v.id("organizations"),
    name: v.string(),
    memberRepoIds: v.array(v.id("repositories")),
    createdAt: v.number(),
  }).index("by_org", ["orgId"]),

  integrations: defineTable({
    orgId: v.id("organizations"),
    provider: v.union(
      v.literal("atlassian"),
      v.literal("linear"),
      v.literal("devin"),
    ),
    status: integrationStatus,
    connectedAt: v.union(v.number(), v.null()),
  }).index("by_org", ["orgId"]),

  members: defineTable({
    orgId: v.id("organizations"),
    email: v.string(),
    name: v.string(),
    role: memberRole,
    avatarSeed: v.string(),
  })
    .index("by_org", ["orgId"])
    .index("by_email", ["email"]),

  apiKeys: defineTable({
    orgId: v.id("organizations"),
    name: v.string(),
    keyId: v.string(),
    createdAt: v.number(),
  }).index("by_org", ["orgId"]),

  usageDays: defineTable({
    orgId: v.id("organizations"),
    date: v.number(),
    codeReviewCredits: v.number(),
    trexCredits: v.number(),
    cliCredits: v.number(),
    reviews: v.number(),
  }).index("by_org_date", ["orgId", "date"]),

  orgSettings: defineTable({
    orgId: v.id("organizations"),
    autoReviewNewCommits: v.boolean(),
    reviewDraftPrs: v.boolean(),
    fileChangeLimit: v.number(),
    authorFilterMode: v.union(v.literal("exclude"), v.literal("include")),
    authorFilterTokens: v.array(v.string()),
    updatePrDescription: v.boolean(),
    summarySections: v.object({
      prSummary: sectionConfig,
      confidenceScore: sectionConfig,
      issueTable: sectionConfig,
      sequenceDiagram: sectionConfig,
      commentsOutsideDiff: sectionConfig,
    }),
    customInstructions: v.string(),
    strictness: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    commentHeader: v.string(),
    promptToFixWithAi: v.boolean(),
    useStatusChecks: v.boolean(),
    requiredConfidence: v.number(),
    postStatusComments: v.boolean(),
    autoApprovePrs: v.boolean(),
    maxAutoApproveRisk: impact,
    trexEnabled: v.boolean(),
    memoryRuleCreators: v.union(v.literal("everyone"), v.literal("admins")),
    autoEnableNewRepos: v.boolean(),
    helpImproveGreptile: v.boolean(),
    featureTips: v.boolean(),
    orgDisplayName: v.string(),
  }).index("by_org", ["orgId"]),

  personalSettings: defineTable({
    userId: v.string(),
    name: v.string(),
    email: v.string(),
    showAiFixPrompts: v.boolean(),
    selectedAgents: v.array(v.string()),
    reviewSections: v.object({
      summary: sectionConfig,
      issuesTable: sectionConfig,
      diagram: sectionConfig,
      commentsOutsideDiff: sectionConfig,
    }),
    trexOnMyPrs: v.union(v.literal("default"), v.literal("off")),
    weeklyDigest: v.boolean(),
    githubLinked: v.boolean(),
    cursorCloudAgents: integrationStatus,
  }).index("by_user", ["userId"]),
});
