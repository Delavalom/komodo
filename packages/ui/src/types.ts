export type Severity = "critical" | "major" | "minor" | "trivial";
export type JudgementKind = "Choice" | "Risk" | "Behaviour" | "Domain" | "Unsure";
export type Bucket = "Blocks" | "Agreed" | "Asked" | "Passed on";

export interface JudgementOption {
  label: string;
  bucket: Bucket;
}

/** Mirrors `Judgement` in @komodo/core — this viewer is deliberately dependency-free. */
export interface Judgement {
  path: string;
  line: number;
  endLine?: number;
  severity: Severity;
  kind: JudgementKind;
  tag: string;
  title: string;
  lede: string;
  detail: string;
  ask: string;
  sources: string[];
  sourceNote: string;
  code: string;
  options: JudgementOption[];
  suggestion?: string;
  fixPrompt: string;
}

export interface WalkthroughEntry {
  files: string[];
  summary: string;
}

export interface ReviewResult {
  summary: string;
  walkthrough: WalkthroughEntry[];
  confidence: number;
  verdict: string;
  effort: number;
  diagram?: string;
  judgements: Judgement[];
}

export interface PR {
  owner: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  url: string;
  baseRef: string;
  headRef: string;
  headSha: string;
}

export interface FileChange {
  path: string;
  additions: number;
  deletions: number;
  status: string;
  patch?: string;
}

export interface ReviewRecord {
  version: 1;
  id: string;
  createdAt: string;
  provider: string;
  model?: string;
  pr: PR;
  files: FileChange[];
  result: ReviewResult;
  posted: boolean;
}

export interface ReviewSummary {
  id: string;
  createdAt: string;
  provider: string;
  pr: PR;
  confidence: number;
  judgements: number;
  posted: boolean;
}
