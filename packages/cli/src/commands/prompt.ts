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
import pc from "picocolors";
import {
  buildReviewPrompt,
  effectivePathFilters,
  filterPaths,
  loadConfig,
  LocalGitDiffSource,
  reviewResultJsonSchema,
  type PRMeta,
} from "@komodo/core";

export async function promptCommand(opts: { base?: string }): Promise<void> {
  const { config } = loadConfig();

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

  process.stdout.write(
    `${buildReviewPrompt({ pr: meta, files, config })}

## Output format

There is no structured-output channel here, so write the result yourself: a
single JSON object matching this schema exactly, and nothing else.

\`\`\`json
${schema}
\`\`\`
`,
  );
}
