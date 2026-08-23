import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCheckout } from "../src/checkout.js";

/**
 * The contract worth pinning is the degradation, not the fetch: a repository
 * the server cannot reach must cost that pull request its working tree and
 * nothing else. If this ever throws instead, one unreachable repo takes down
 * the whole ingest pass.
 *
 * git is removed from PATH rather than the network being blocked, so the test
 * is hermetic and exercises the same catch.
 */
describe("createCheckout", () => {
  let cacheDir: string;
  let path: string | undefined;

  beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), "komodo-checkout-test-"));
    path = process.env.PATH;
    process.env.PATH = mkdtempSync(join(tmpdir(), "komodo-empty-path-"));
  });

  afterEach(() => {
    process.env.PATH = path;
    rmSync(cacheDir, { recursive: true, force: true });
  });

  it("degrades to no working tree instead of throwing", async () => {
    const messages: string[] = [];
    const checkout = createCheckout({
      cacheDir,
      onProgress: (m) => messages.push(m),
    });

    await expect(
      checkout.prepare({ owner: "acme", name: "widgets", number: 7 }),
    ).resolves.toBeUndefined();

    // The reviewer still runs, so the log has to say why it got less.
    expect(messages.join("\n")).toContain("reviewing the diff alone");
  });
});
