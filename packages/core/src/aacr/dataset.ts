import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { PythonRandom } from "./python-compat.js";
import type { AacrInstance, AacrReference } from "./types.js";

/**
 * AACR-Bench (github.com/alibaba/aacr-bench, Apache-2.0), fetched rather than
 * vendored. Pinned to the commit whose evaluator this harness was ported
 * from, and checked against the sha256 the benchmark's own
 * `positive_samples.meta.json` publishes — a moved file fails loudly instead
 * of quietly scoring against different references.
 */
export const AACR_COMMIT = "c99d126f17ada739d2b4d51d814b6c62a2aa4ab9";

export const AACR_DATASETS = {
  v1: {
    url: `https://raw.githubusercontent.com/alibaba/aacr-bench/${AACR_COMMIT}/dataset/v1/positive_samples.json`,
    sha256: "02c8561f1c3994a26f427d479b2a3f6e6c8e6858161fbc903b45248fa2cb2097",
  },
  v2: {
    url: `https://raw.githubusercontent.com/alibaba/aacr-bench/${AACR_COMMIT}/dataset/v2/positive_samples.json`,
    sha256: "2e83975aba1ca06544ccecdee8d99ab7152bc1d02a3d86bce3022d8d4e3010ba",
  },
} as const;

export type AacrVersion = keyof typeof AACR_DATASETS;

export function isAacrVersion(value: string): value is AacrVersion {
  return Object.hasOwn(AACR_DATASETS, value);
}

/** Where datasets and clones are kept between runs: ~/.cache/komodo/aacr. */
export function defaultAacrCacheDir(): string {
  const base = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
  return join(base, "komodo", "aacr");
}

export function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * The dataset file for `version`, downloaded into `cacheDir` on first use and
 * verified on every use. A cached file that no longer matches is fetched
 * again; a download that does not match is never written where the next run
 * would trust it.
 */
export async function ensureAacrDataset(
  version: AacrVersion,
  cacheDir: string = defaultAacrCacheDir(),
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const { url, sha256: expected } = AACR_DATASETS[version];
  const dir = join(cacheDir, "datasets");
  const path = join(dir, `${version}-${expected.slice(0, 12)}.json`);
  if (existsSync(path) && sha256(readFileSync(path)) === expected) return path;

  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Downloading AACR-Bench ${version} failed: HTTP ${response.status} from ${url}`);
  }
  const body = Buffer.from(await response.arrayBuffer());
  const actual = sha256(body);
  if (actual !== expected) {
    throw new Error(
      `AACR-Bench ${version} failed its checksum: expected sha256 ${expected}, got ${actual} from ${url}`,
    );
  }
  mkdirSync(dir, { recursive: true });
  const partial = `${path}.part`;
  writeFileSync(partial, body);
  renameSync(partial, path);
  return path;
}

/** One record of `positive_samples.json`, as much of it as the harness reads. */
export interface AacrRecord {
  githubPrUrl?: unknown;
  source_commit?: unknown;
  target_commit?: unknown;
  project_main_language?: unknown;
  change_line_count?: unknown;
  comments?: unknown;
  [key: string]: unknown;
}

export function loadAacrRecords(path: string): AacrRecord[] {
  const records: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(records)) throw new Error(`AACR-Bench data should be a JSON array: ${path}`);
  return records as AacrRecord[];
}

const PR_URL = /github\.com\/([^/]+)\/([^/]+)\/pull\/\d+/i;

/** `owner/name` out of a pull request URL, as `parse_repo_from_pr_url` reads it. */
export function repoFromPrUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const m = PR_URL.exec(url);
  return m ? `${m[1]}/${m[2]}` : null;
}

/** `_normalize_line_range`: fill a missing end from the other, then order them. */
export function normalizeLineRange(
  from: number | null | undefined,
  to: number | null | undefined,
): { fromLine?: number; toLine?: number } {
  let a = from ?? undefined;
  let b = to ?? undefined;
  if (a === undefined && b === undefined) return {};
  if (a === undefined) a = b;
  if (b === undefined) b = a;
  if ((a as number) > (b as number)) [a, b] = [b, a];
  return { fromLine: a, toLine: b };
}

function lineOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

/**
 * One record as an instance, following `convert_record` in the official
 * converter: base is `source_commit`, head is `target_commit`, the id is
 * `owner__name@<head[:7]>`, and a comment without a path or a note is
 * dropped. Null when a field the review needs is missing.
 */
export function convertAacrRecord(record: AacrRecord): AacrInstance | null {
  if (!record || typeof record !== "object") return null;
  const repo = repoFromPrUrl(record.githubPrUrl);
  const base = record.source_commit;
  const head = record.target_commit;
  if (!repo || !base || !head) return null;
  const baseCommit = String(base).trim();
  const headCommit = String(head).trim();

  const references: AacrReference[] = [];
  for (const raw of Array.isArray(record.comments) ? record.comments : []) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    const path = c.path;
    const note = c.note;
    if (!path || !note || !String(note).trim()) continue;
    const side = c.side == null ? undefined : String(c.side).trim();
    references.push({
      path: String(path).trim(),
      ...normalizeLineRange(lineOrUndefined(c.from_line), lineOrUndefined(c.to_line)),
      ...(side === "left" || side === "right" ? { side } : {}),
      note: String(note).trim(),
      category: typeof c.category === "string" ? c.category : "",
      context: typeof c.context === "string" ? c.context : "",
    });
  }

  return {
    id: `${repo.replaceAll("/", "__")}@${String(head).slice(0, 7)}`.trim(),
    repo,
    prUrl: String(record.githubPrUrl),
    language: typeof record.project_main_language === "string" ? record.project_main_language : "unknown",
    baseCommit,
    headCommit,
    changeLines: typeof record.change_line_count === "number" ? record.change_line_count : 0,
    references,
  };
}

export interface SampleOptions {
  /** Keep the first N after shuffling (all when omitted). */
  limit?: number;
  /** `random.Random(seed).shuffle`, exactly as the official converter's `--seed`. */
  seed: number;
  /**
   * `language` takes one pull request per language in turn, each language's
   * in shuffled order, so a small `--limit` is not mostly C++. Languages are
   * visited in the order they first appear after the shuffle. Off, the
   * selection is the converter's: shuffle, then slice.
   */
  stratify?: "language";
}

/**
 * Shuffle every record, select, then convert — the converter's order, so a
 * given seed and limit pick the same pull requests as
 * `python -m converters.aacr_bench --seed S --limit N`. Records that fail to
 * convert are dropped after the cut, as there.
 */
export function sampleAacrInstances(records: AacrRecord[], opts: SampleOptions): AacrInstance[] {
  const shuffled = new PythonRandom(opts.seed).shuffle([...records]);
  const ordered = opts.stratify === "language" ? roundRobinByLanguage(shuffled) : shuffled;
  const picked = opts.limit === undefined ? ordered : ordered.slice(0, opts.limit);
  return picked.map(convertAacrRecord).filter((i): i is AacrInstance => i !== null);
}

function roundRobinByLanguage(records: AacrRecord[]): AacrRecord[] {
  const groups = new Map<string, AacrRecord[]>();
  for (const record of records) {
    const language =
      typeof record.project_main_language === "string" ? record.project_main_language : "unknown";
    const group = groups.get(language);
    if (group) group.push(record);
    else groups.set(language, [record]);
  }
  const queues = [...groups.values()];
  const out: AacrRecord[] = [];
  for (let round = 0; out.length < records.length; round++) {
    for (const queue of queues) {
      if (round < queue.length) out.push(queue[round]);
    }
  }
  return out;
}
