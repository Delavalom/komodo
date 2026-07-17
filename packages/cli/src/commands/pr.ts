import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pc from "picocolors";
import {
  createProvider,
  GitHubClient,
  loadConfig,
  parsePRRef,
  runReview,
  SEVERITY_LABEL,
  type PRRef,
} from "@komodo/core";

export async function prCommand(
  ref: string,
  opts: { localOnly: boolean; provider?: string; model?: string },
): Promise<void> {
  const prRef = parsePRRef(ref);
  const { config } = loadConfig();
  if (opts.model) config.model = opts.model;
  const provider = createProvider(config, opts.provider);
  const github = new GitHubClient();

  const repoDir = resolveRepoDir(prRef);
  if (repoDir) console.log(pc.dim(`Using repo context from ${repoDir}`));

  const spin = (msg: string) => console.log(pc.dim(`• ${msg}`));
  const outcome = await runReview({
    ref: prRef,
    provider,
    config,
    github,
    repoDir,
    post: !opts.localOnly,
    onProgress: spin,
    model: config.model,
  });

  const r = outcome.record.result;
  console.log(pc.bold(`\n🦎 Komodo review — ${prRef.owner}/${prRef.repo}#${prRef.number}`));
  console.log(`${"🟩".repeat(r.confidence)}${"⬜".repeat(5 - r.confidence)} ${pc.bold(`${r.confidence}/5`)} — ${r.verdict}`);
  if (r.findings.length) {
    console.log("");
    for (const f of r.findings) {
      console.log(`  ${SEVERITY_LABEL[f.severity]}  ${f.path}:${f.line}  ${f.title}`);
    }
  } else {
    console.log(pc.green("  No blocking findings."));
  }
  if (outcome.droppedFindings.length) {
    console.log(pc.dim(`  (${outcome.droppedFindings.length} finding(s) dropped: below min_severity or unanchorable)`));
  }
  if (outcome.reviewUrl) console.log(`\n${pc.bold("Posted:")} ${outcome.reviewUrl}`);
  console.log(`${pc.bold("Saved:")} ${outcome.recordPath}`);
  console.log(pc.dim(`View locally: npx komodo-review ui`));
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
