import pc from "picocolors";
import { effectivePathFilters, filterPaths, loadConfig, LocalGitDiffSource, annotatePatch } from "@komodo/core";

export async function diffCommand(opts: { base?: string }): Promise<void> {
  const { config } = loadConfig();

  let source: InstanceType<typeof LocalGitDiffSource>;
  try {
    source = new LocalGitDiffSource(process.cwd(), opts.base);
  } catch (err) {
    console.error(pc.red(`Failed to initialize diff source: ${err instanceof Error ? err.message : err}`));
    console.error(pc.dim("Ensure you're in a git repository with a valid base branch."));
    process.exit(1);
  }

  let meta, allFiles;
  try {
    meta = await source.getMeta();
    allFiles = await source.getFiles();
  } catch (err) {
    console.error(pc.red(`Failed to read git diff: ${err instanceof Error ? err.message : err}`));
    process.exit(1);
  }

  const keptPaths = new Set(filterPaths(allFiles.map((f) => f.path), effectivePathFilters(config)));
  const files = allFiles.filter((f) => keptPaths.has(f.path));

  const annotatedFiles = files.map((f) => ({
    ...f,
    annotatedPatch: f.patch ? annotatePatch(f.patch) : undefined,
  }));

  const output = { meta, files: annotatedFiles, config };
  process.stdout.write(JSON.stringify(output, null, 2));
}
