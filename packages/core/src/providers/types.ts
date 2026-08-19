import type { KomodoConfig } from "../config.js";
import type { PRFile, PRMeta } from "../github.js";
import type { ReviewResult } from "../schema.js";

export interface ReviewInput {
  pr: PRMeta;
  /** Files after path filtering, with annotated patches. */
  files: PRFile[];
  config: KomodoConfig;
  /** Local checkout of the PR head, when available — providers with tools can Read/Grep it. */
  repoDir?: string;
}

export interface ReviewProvider {
  readonly name: string;
  review(input: ReviewInput, onProgress?: (msg: string) => void): Promise<ReviewResult>;
}
