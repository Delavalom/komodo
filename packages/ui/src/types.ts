export type Severity = "critical" | "major" | "minor" | "trivial";
export type Category =
  | "security"
  | "correctness"
  | "performance"
  | "maintainability"
  | "data-integrity"
  | "stability";

export interface Finding {
  path: string;
  line: number;
  endLine?: number;
  severity: Severity;
  category: Category;
  title: string;
  body: string;
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
  findings: Finding[];
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
  findings: number;
  posted: boolean;
}
