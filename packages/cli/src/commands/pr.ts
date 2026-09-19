import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import pc from "picocolors";
import {
  createProvider,
  GitHubClient,
  loadConfig,
  parsePRRef,
  resolveContextSources,
  runReview,
  SEVERITY_LABEL,
  type PRRef,
} from "@komodo/core";
import { recordReview } from "@komodo/ingest";
import { connectStore, isPostgresUrl } from "@komodo/store/connect";

export async function prCommand(
  ref: string,
  opts: { localOnly: boolean; provider?: string; model?: string },
): Promise<void> {
  const prRef = parsePRRef(ref);
  const { config, path: configPath } = loadConfig();
  if (opts.model) config.model = opts.model;
  const provider = createProvider(config, opts.provider);
  const github = new GitHubClient();

  const repoDir = resolveRepoDir(prRef);
  if (repoDir) console.log(pc.dim(`Using repo context from ${repoDir}`));

  const spin = (msg: string) => console.log(pc.dim(`• ${msg}`));

  // No store here, so a document scoped to a repo cluster cannot be resolved
  // — clusterNames is left undefined rather than [], which is what tells
  // `selectSharedContext` to report it as needing one instead of dropping it
  // silently. `repos:` and `globs:` scoping still works.
  const contextSources = resolveContextSources(config, configPath ? dirname(configPath) : process.cwd());
  for (const source of contextSources.filter((s) => !s.ok)) {
    console.error(pc.yellow(`Shared context source "${source.name}" could not be read: ${source.error}`));
  }

  const outcome = await runReview({
    ref: prRef,
    provider,
    config,
    github,
    repoDir,
    contextSources,
    contextScope: { repoId: `${prRef.owner}/${prRef.repo}` },
    post: !opts.localOnly,
    onProgress: spin,
    model: config.model,
  });

  if (outcome.sharedContext.length) {
    console.log(pc.dim(`  applied shared context: ${outcome.sharedContext.map((d) => d.label).join(", ")}`));
  }
  if (outcome.sharedContextNeedsClusters.length) {
    console.error(
      pc.yellow(
        `  ${outcome.sharedContextNeedsClusters.length} shared context document(s) are scoped to a repo cluster, which \`komodo pr\` cannot resolve; skipped.`,
      ),
    );
  }

  const r = outcome.record.result;
  console.log(pc.bold(`\n🦎 Komodo review — ${prRef.owner}/${prRef.repo}#${prRef.number}`));
  console.log(`${"🟩".repeat(r.confidence)}${"⬜".repeat(5 - r.confidence)} ${pc.bold(`${r.confidence}/5`)} — ${r.verdict}`);
  if (r.judgements.length) {
    console.log("");
    for (const j of r.judgements) {
      console.log(`  ${SEVERITY_LABEL[j.severity]}  ${j.path}:${j.line}  ${j.title}`);
      console.log(pc.dim(`      ${j.ask}`));
    }
  } else {
    console.log(pc.green("  Nothing to judge."));
  }
  if (outcome.droppedJudgements.length) {
    console.log(
      pc.dim(`  (${outcome.droppedJudgements.length} judgement(s) dropped: below min_severity or unanchorable)`),
    );
  }
  // Into the store, so the review is answerable rather than just printed. The
  // same database `komodo dev` and `komodo serve` open, resolved the same way.
  const reviewed = await saveToStore(github, outcome);

  if (outcome.reviewUrl) console.log(`\n${pc.bold("Receipt:")} ${outcome.reviewUrl}`);
  console.log(`${pc.bold("Saved:")} ${outcome.recordPath}`);
  if (reviewed) {
    const base = config.local.url.replace(/\/$/, "");
    console.log(
      `${pc.bold("Answer it:")} ` +
        pc.cyan(`${base}/-/pr/${prRef.owner}/${prRef.repo}/${prRef.number}`),
    );
    console.log(pc.dim("Start the queue with `komodo-review dev` if it is not running."));
  }
}

/**
 * Writing to the store must never lose a review that already ran. A missing
 * database or a schema this build cannot open is worth a warning, not an
 * exception on top of a completed review whose record is already on disk.
 */
async function saveToStore(
  github: GitHubClient,
  outcome: Awaited<ReturnType<typeof runReview>>,
): Promise<boolean> {
  const target =
    process.env.DATABASE_URL || join(process.cwd(), ".komodo", "komodo.db");
  const store = await connectStore(isPostgresUrl(target) ? target : resolve(target));
  try {
    await recordReview({ store, github, outcome });
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(pc.yellow(`\nCould not write to the review queue: ${message}`));
    return false;
  } finally {
    store.close();
  }
}

/** Use cwd if it is a clone of the PR's repo; otherwise shallow-clone the head to a temp dir. */
function resolveRepoDir(ref: PRRef): string | undefined {
  try {
    const remote = execFileSync("git", ["remote", "get-url", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (remote.toLowerCase().includes(`${ref.owner}/${ref.repo}`.toLowerCase())) {
      return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
    }
  } catch {
    // not in a git repo — fall through to clone
  }
  try {
    const dir = mkdtempSync(join(tmpdir(), "komodo-checkout-"));
    execFileSync(
      "gh",
      ["repo", "clone", `${ref.owner}/${ref.repo}`, dir, "--", "--depth", "1"],
      { stdio: ["ignore", "ignore", "ignore"], timeout: 120_000 },
    );
    execFileSync("gh", ["pr", "checkout", String(ref.number)], {
      cwd: dir,
      stdio: ["ignore", "ignore", "ignore"],
      timeout: 120_000,
    });
    return dir;
  } catch {
    return undefined; // diff-only review still works
  }
}
