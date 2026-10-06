/**
 * Reading `owner/repo` out of a git remote — the identity a checkout is held
 * to before it may take a claimed head.
 */
import { describe, expect, it } from "vitest";

import { repoFromRemoteUrl } from "../src/diff-sources/local-git.js";

describe("reading owner/repo out of a git remote", () => {
  it("reads an https remote", () => {
    expect(repoFromRemoteUrl("https://github.com/Delavalom/komodo.git")).toEqual({
      owner: "Delavalom",
      repo: "komodo",
    });
  });

  it("reads an ssh remote", () => {
    expect(repoFromRemoteUrl("git@github.com:Delavalom/komodo.git")).toEqual({
      owner: "Delavalom",
      repo: "komodo",
    });
  });

  it("reads a remote with no .git suffix", () => {
    expect(repoFromRemoteUrl("https://github.com/Delavalom/komodo")).toEqual({
      owner: "Delavalom",
      repo: "komodo",
    });
  });

  it("answers null for something that is not a remote", () => {
    expect(repoFromRemoteUrl("komodo")).toBeNull();
  });
});
