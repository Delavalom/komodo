import type { KomodoConfig } from "../config.js";
import type { PRFile, PRMeta } from "../github.js";
import type { ReviewResult } from "../schema.js";

/**
 * One thing this team has taught Komodo, selected because it applies here.
 *
 * A plain structural type rather than a store row: core has no dependency on
 * @komodo/store and must not grow one. The ingester matches the rules against
 * the changed paths and hands over what survived — see
 * packages/ingest/src/memory.ts.
 */
export interface ReviewMemory {
  /** The rule as someone wrote it, or the contents of a file they pointed at. */
  text: string;
  /** Where it came from, for the "sources" a judgement has to cite. */
  label: string;
}

export interface ReviewInput {
  pr: PRMeta;
  /** Files after path filtering, with annotated patches. */
  files: PRFile[];
  config: KomodoConfig;
  /** Local checkout of the PR head, when available — providers with tools can Read/Grep it. */
  repoDir?: string;
  /**
   * The team's own conventions, already narrowed to the ones whose scope
   * matches this pull request. Empty when nothing applies, which is the
   * common case and must read as "no extra rules" rather than as an omission.
   */
  memories?: ReviewMemory[];
}

export interface ReviewProvider {
  readonly name: string;
  review(input: ReviewInput, onProgress?: (msg: string) => void): Promise<ReviewResult>;
}
