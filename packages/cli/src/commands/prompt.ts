/**
 * The review prompt, printed rather than sent.
 *
 * `komodo pr` hands this prompt to a provider. An agent that is already
 * running — Claude Code, Cursor, Codex — is a provider too, and a better one
 * than either: it has the working tree open and the user's attention. But an
 * agent cannot import buildReviewPrompt, so it would otherwise have to carry
 * its own copy of the review persona in a skill file, and two copies of a
 * persona drift apart in about a week.
 *
 * So the skill asks for the prompt instead of restating it, and there stays
 * exactly one definition of what a Komodo review is.
 */
import { execFileSync } from "node:child_process";
import { dirname } from "node:path";
import pc from "picocolors";
import {
  buildReviewPrompt,
  effectivePathFilters,
  filterPaths,
  loadConfig,
  LocalGitDiffSource,
  readFeatureMap,
  resolveContextSources,
  reviewResultJsonSchema,
  selectSharedContext,
  type PRMeta,
} from "@komodo/core";

export async function promptCommand(opts: { base?: string; json?: boolean }): Promise<void> {
  const { config, path: configPath } = loadConfig();

  let source: InstanceType<typeof LocalGitDiffSource>;
  try {
    source = new LocalGitDiffSource(process.cwd(), opts.base);
  } catch (err) {
    console.error(
      pc.red(`Failed to initialize diff source: ${err instanceof Error ? err.message : err}`),
    );
    console.error(pc.dim("Ensure you're in a git repository with a valid base branch."));
    process.exit(1);
  }

  let meta: PRMeta;
  let allFiles;
  try {
    meta = (await source.getMeta()) as PRMeta;
    allFiles = await source.getFiles();
  } catch (err) {
    console.error(
      pc.red(`Failed to read git diff: ${err instanceof Error ? err.message : err}`),
    );
    process.exit(1);
  }

  const keptPaths = new Set(
    filterPaths(
      allFiles.map((f) => f.path),
      effectivePathFilters(config),
    ),
  );
  const files = allFiles.filter((f) => keptPaths.has(f.path));

  if (files.length === 0) {
    console.error(pc.red("No reviewable changes on this branch relative to the base."));
    process.exit(1);
  }

  // The provider path gets the schema through the SDK's structured-output
  // channel; an agent reading this has no such channel, so it is spelled out.
  const schema = JSON.stringify(reviewResultJsonSchema(), null, 2);

  // No store on this path, so a document scoped to a repo cluster cannot be
  // resolved here — `repos:` and `globs:` scoping still applies. Diagnostics
  // go to stderr; stdout stays exactly the prompt the skill pipes onward.
  const contextSources = resolveContextSources(config, configPath ? dirname(configPath) : process.cwd());
  for (const source of contextSources.filter((s) => !s.ok)) {
    console.error(pc.yellow(`Shared context source "${source.name}" could not be read: ${source.error}`));
  }
  const repoId = meta.owner !== "local" ? `${meta.owner}/${meta.repo}` : undefined;
  const shared = selectSharedContext(contextSources, {
    repoId,
    changedPaths: files.map((f) => f.path),
    maxTotalChars: config.context.max_total_chars,
  });
  if (shared.needsClusters.length) {
    console.error(
      pc.yellow(
        `${shared.needsClusters.length} shared context document(s) are scoped to a repo cluster, which this command cannot resolve; skipped.`,
      ),
    );
  }

  // The working tree is the head this prompt reviews, so its feature map is
  // the one that describes the change. Read from the top level rather than
  // the cwd: the skill may run from any directory inside the repository.
  const featureMap = readFeatureMap(gitTopLevel() ?? process.cwd());
  if (featureMap) {
    console.error(pc.dim(`Writing checks from the feature map in ${featureMap.path}.`));
  }

  const reviewPrompt = buildReviewPrompt({
    pr: meta,
    files,
    config,
    sharedContext: shared.docs,
    featureMap: featureMap ?? undefined,
  });

  // A caller with a structured channel (the Claude Code mod's submit_review
  // tool) takes the schema as that tool's input schema, so its prompt carries
  // no "write the JSON yourself" section for the tool to contradict.
  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ prompt: reviewPrompt, schema: reviewResultJsonSchema() })}\n`);
    return;
  }

  process.stdout.write(
    `${reviewPrompt}

## Output format

There is no structured-output channel here, so write the result yourself: a
single JSON object matching this schema exactly, and nothing else.

\`\`\`json
${schema}
\`\`\`
`,
  );
}

function gitTopLevel(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || null;
  } catch {
    return null;
  }
}
