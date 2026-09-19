/**
 * Inspects `context.sources` from komodo.yaml without running a review.
 *
 * The seam this fills: a screen that shows a number nothing can produce is a
 * lie waiting to be found (AGENTS.md rule 10). Before this existed the only
 * way to know what a shared context source resolved to was to run a review
 * and read its progress lines.
 */
import { dirname } from "node:path";
import pc from "picocolors";
import { loadConfig, resolveContextSources, selectSharedContext } from "@komodo/core";

export async function contextCommand(opts: { repo?: string; paths?: string }): Promise<void> {
  const { config, path: configPath } = loadConfig();

  if (!config.context.sources.length) {
    console.log(pc.dim("No `context.sources` configured in komodo.yaml."));
    return;
  }

  const configDir = configPath ? dirname(configPath) : process.cwd();
  const resolved = resolveContextSources(config, configDir);
  const changedPaths = opts.paths ? opts.paths.split(",").map((p) => p.trim()).filter(Boolean) : [];
  const selection = opts.repo
    ? selectSharedContext(resolved, { repoId: opts.repo, changedPaths, maxTotalChars: config.context.max_total_chars })
    : undefined;
  const applied = new Set(selection?.docs.map((d) => d.label));

  for (const source of resolved) {
    console.log(`\n${pc.bold(source.name)}  ${pc.dim(source.root)}`);
    if (!source.ok) {
      console.log(pc.red(`  ${source.error}`));
      continue;
    }
    if (source.source.repos.length) console.log(pc.dim(`  repos: ${source.source.repos.join(", ")}`));
    if (source.source.clusters.length) console.log(pc.dim(`  clusters: ${source.source.clusters.join(", ")}`));
    if (!source.files.length) {
      console.log(pc.dim("  (no markdown files)"));
      continue;
    }
    for (const file of source.files) {
      const scope: string[] = [];
      if (file.scope.repos.length) scope.push(`repos: ${file.scope.repos.join(", ")}`);
      if (file.scope.clusters.length) scope.push(`clusters: ${file.scope.clusters.join(", ")}`);
      if (file.scope.globs.length) scope.push(`globs: ${file.scope.globs.join(", ")}`);
      const mark = selection ? (applied.has(file.label) ? pc.green("✓") : pc.dim("·")) : " ";
      console.log(`  ${mark} ${file.path}  ${pc.dim(`${file.chars} chars${file.truncated ? ", truncated" : ""}`)}`);
      if (file.description) console.log(pc.dim(`      ${file.description}`));
      if (scope.length) console.log(pc.dim(`      ${scope.join(" · ")}`));
      if (file.warning) console.log(pc.yellow(`      ${file.warning}`));
    }
  }

  if (selection) {
    console.log(
      `\n${pc.bold(String(selection.docs.length))} document(s) would apply` +
        (opts.repo ? ` to ${opts.repo}` : "") +
        `, ${selection.docs.reduce((n, d) => n + d.text.length, 0)} total chars.`,
    );
    if (selection.overflow.length) {
      console.log(pc.yellow(`${selection.overflow.length} document(s) dropped over the ${config.context.max_total_chars}-character cap.`));
    }
    if (selection.needsClusters.length) {
      console.log(pc.yellow(`${selection.needsClusters.length} document(s) are cluster-scoped; pass --repo and check the deployment's clusters to resolve them.`));
    }
  } else {
    console.log(pc.dim("\nPass --repo owner/name (and optionally --paths a,b) to see what would apply to a review."));
  }
}
