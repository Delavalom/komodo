import {
  pgTable,
  text,
  uuid,
  timestamp,
  numeric,
  integer,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";
import type { ReviewRecord } from "@komodo/core";

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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
  postToGithubDefault: boolean("post_to_github_default").notNull().default(true),
  /** quiet = only the most important findings, assertive = maximum detail. */
  reviewProfile: text("review_profile").notNull().default("chill"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type CreditLedgerEntry = typeof creditLedger.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;
