/**
 * Client-safe entry point: types and the port, nothing that touches Node.
 *
 * The drivers live behind their own subpath exports (`@komodo/store/sqlite`)
 * because importing one pulls in node:sqlite. Client components import from
 * here — where every export is erased at compile time — and never from a
 * driver.
 */
export type {
  Finding,
  FindingStatus,
  ImpactLevel,
  Judgment,
  Member,
  MemberRole,
  Organization,
  PullRequest,
  PullRequestState,
  Repository,
  ReviewStatus,
  Severity,
  Team,
  Verdict,
} from "./types.js";

export type {
  FindingInput,
  JudgmentInput,
  KomodoStore,
  PullRequestInput,
  QueueSnapshot,
  StoreReader,
  StoreWriter,
} from "./port.js";

export { verdictFor } from "./verdict.js";
