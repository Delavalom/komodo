import type { DiffFile, DiffMeta, DiffSource } from "../diff-source.js";
import type { GitHubClient, PRRef } from "../github.js";

export class GitHubDiffSource implements DiffSource {
  constructor(
    private github: GitHubClient,
    private ref: PRRef,
  ) {}

  async getMeta(): Promise<DiffMeta> {
    const pr = await this.github.getPR(this.ref);
    return {
      owner: pr.owner,
      repo: pr.repo,
      number: pr.number,
      title: pr.title,
      author: pr.author,
      url: pr.url,
      baseRef: pr.baseRef,
      headRef: pr.headRef,
      headSha: pr.headSha,
      body: pr.body,
      isDraft: pr.isDraft,
      labels: pr.labels,
    };
  }

  async getFiles(): Promise<DiffFile[]> {
    const files = await this.github.listFiles(this.ref);
    return files.map((f) => ({
      path: f.path,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch,
    }));
  }
}
