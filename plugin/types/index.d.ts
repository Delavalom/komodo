/** The job this session claimed, from `/komodo-claim` until `submit_review` lands. */
export type KomodoJob = {
  claimPath: string;
  repoId: string;
  number: number;
  title: string;
  url: string;
  headSha: string;
  leaseExpiresAt: number;
  /** The ReviewResult JSON schema the CLI printed, offered again after a reload. */
  schema: Record<string, unknown>;
};

declare module "claude-code" {
  interface PluginState {
    komodo: { job: KomodoJob | null };
  }
}
