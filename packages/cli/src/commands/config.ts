import pc from "picocolors";
import { loadConfig } from "@komodo/core";

export async function configCommand(): Promise<void> {
  const { config, path } = loadConfig();
  console.log(pc.dim(path ? `# from ${path}` : "# defaults (no komodo.yaml found)"));
  console.log(JSON.stringify(config, null, 2));
}
