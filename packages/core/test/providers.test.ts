import { realpathSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { KomodoConfigSchema } from "../src/config.js";
import { resolveClaudeExecutable } from "../src/providers/index.js";

describe("managed Claude executable", () => {
  it("accepts and resolves an absolute executable path", () => {
    const config = KomodoConfigSchema.parse({
      claude: { executable: process.execPath },
    });
    expect(resolveClaudeExecutable(config)).toBe(realpathSync(process.execPath));
  });

  it("rejects a relative launcher instead of silently searching PATH", () => {
    const config = KomodoConfigSchema.parse({
      claude: { executable: "bin/company-claude" },
    });
    expect(() => resolveClaudeExecutable(config)).toThrow(
      "must be an absolute path",
    );
  });
});
