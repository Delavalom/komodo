import {
  pgTable,
  text,
  uuid,
  timestamp,
  numeric,
  integer,
  jsonb,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import type { Bucket, JudgementKind, JudgementOption, ReviewRecord } from "@komodo/core";

export const users = pgTable("users", {
  id: text("id").primaryKey(), // GitHub user id (string)
  login: text("login").notNull(),
  name: text("name"),
  avatarUrl: text("avatar_url").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reviews = pgTable("reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  number: integer("number").notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  provider: text("provider").notNull().default("openrouter"),
  model: text("model"),
  confidence: integer("confidence"),
  findingsCount: integer("findings_count").notNull().default(0),
  costUsd: numeric("cost_usd", { precision: 12, scale: 6 }),
  creditsCharged: integer("credits_charged").notNull().default(0),
  record: jsonb("record").$type<ReviewRecord>(),
  /** Set once the reviewer posts their review to GitHub. Guards against double-posting. */
  postedAt: timestamp("posted_at", { withTimezone: true }),
  postedUrl: text("posted_url"),
  postedEvent: text("posted_event").$type<"APPROVE" | "REQUEST_CHANGES" | "COMMENT">(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One decision put to the reviewer. Materialized from `reviews.record` when the
 * review is created so the cross-PR queue is an indexed query rather than a
 * scan over jsonb.
 *
 * Lifecycle: `open` → answered (bucket set) → `closed`. Choosing the "Asked"
 * option moves it to `awaiting_reply` instead; a reply that Komodo re-reads and
 * withdraws lands on `withdrawn`.
 */
export const judgements = pgTable(
  "judgements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => reviews.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    /** Position within the review — drives "3 / 6" and the progress pips. */
    ordinal: integer("ordinal").notNull(),

    // ---- what Komodo said (copied from the record, immutable) ----
    kind: text("kind").$type<JudgementKind>().notNull(),
    tag: text("tag").notNull(),
    title: text("title").notNull(),
    lede: text("lede").notNull(),
    detail: text("detail").notNull(),
    ask: text("ask").notNull(),
    sources: jsonb("sources").$type<string[]>().notNull(),
    sourceNote: text("source_note").notNull(),
    code: text("code").notNull(),
    options: jsonb("options").$type<JudgementOption[]>().notNull(),
    path: text("path").notNull(),
    line: integer("line").notNull(),
    endLine: integer("end_line"),
    severity: text("severity").notNull(),
    suggestion: text("suggestion"),
    fixPrompt: text("fix_prompt").notNull(),

    // ---- what the reviewer decided ----
    /** Null until answered. */
    bucket: text("bucket").$type<Bucket>(),
    optionLabel: text("option_label"),
    /** The question the reviewer composed, when they chose "Asked". */
    note: text("note"),
    blocking: boolean("blocking").notNull().default(false),
    status: text("status")
      .$type<"open" | "awaiting_reply" | "withdrawn" | "closed">()
      .notNull()
      .default("open"),
    /** The inline PR comment carrying the reviewer's question, once posted. */
    githubCommentId: integer("github_comment_id"),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("judgements_queue_idx").on(t.userId, t.status),
    index("judgements_review_idx").on(t.reviewId, t.ordinal),
  ],
);

/** The reply thread on one judgement: the question, the answer, Komodo's re-read. */
export const judgementMessages = pgTable(
  "judgement_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    judgementId: uuid("judgement_id")
      .notNull()
      .references(() => judgements.id, { onDelete: "cascade" }),
    role: text("role").$type<"reviewer" | "author" | "komodo">().notNull(),
    authorLogin: text("author_login"),
    body: text("body").notNull(),
    /** Set for messages mirrored from a GitHub comment; dedupes on sync. */
    githubCommentId: integer("github_comment_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("judgement_messages_thread_idx").on(t.judgementId, t.createdAt)],
);

export const creditLedger = pgTable("credit_ledger", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(),
  ref: text("ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id),
  defaultModel: text("default_model").notNull().default("anthropic/claude-sonnet-4-5"),
  /** quiet = only the most important findings, assertive = maximum detail. */
  reviewProfile: text("review_profile").notNull().default("chill"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type JudgementRow = typeof judgements.$inferSelect;
export type JudgementMessage = typeof judgementMessages.$inferSelect;
export type CreditLedgerEntry = typeof creditLedger.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;
