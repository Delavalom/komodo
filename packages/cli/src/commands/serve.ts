/**
 * `komodo dev` and `komodo serve`.
 *
 * Both start the same two things — the ingester and the web app — against the
 * same store; they differ only in defaults. `dev` is the one-command local
 * run: an ephemeral database under .komodo/, seeded so the queue has
 * something in it before a token is configured. `serve` is the long-running
 * team deployment: a database that outlives the process, and a poll interval
 * meant for a real repository.
 *
 * Nothing above the store knows which it is, which is the point.
 */
import { dirname, join, resolve } from "node:path";
import pc from "picocolors";
import { createProvider, GitHubClient, loadConfig, resolveGithubToken } from "@komodo/core";
import type { ReviewProvider } from "@komodo/core";
import {
  applyTeamConfig,
  createCheckout,
  initializeSettings,
  runIngestLoop,
} from "@komodo/ingest";
import { connectStore, isPostgresUrl } from "@komodo/store/connect";
import { seedStore } from "@komodo/store/seed";
import type { KomodoStore } from "@komodo/store";

import { startWebServer } from "../web.js";

export interface ServeOptions {
  port: string;
  db?: string;
  interval: string;
  seed?: boolean;
  poll: boolean;
  post: boolean;
  provider?: string;
  /** Fetch a working tree per repository so reviews can read the code. */
  checkout: boolean;
  repoCache?: string;
}

export function devCommand(opts: ServeOptions): Promise<void> {
  return serve({ ...opts, seed: opts.seed ?? true, label: "dev" });
}

export function serveCommand(opts: ServeOptions): Promise<void> {
  return serve({ ...opts, seed: opts.seed ?? false, label: "serve" });
}

async function serve(opts: ServeOptions & { label: string }): Promise<void> {
  const port = parseInt(opts.port, 10);
  const target =
    opts.db ?? process.env.DATABASE_URL ?? join(process.cwd(), ".komodo", "komodo.db");
  // A connection string is passed through untouched; a path is resolved so
  // the web server, which runs from its own directory, opens the same file.
  const dbTarget = isPostgresUrl(target) ? target : resolve(target);
  const { config, path: configPath } = loadConfig();

  const store = await connectStore(dbTarget);
  const dim = (msg: string) => console.log(pc.dim(`• ${msg}`));

  // komodo.yaml's review settings are adopted into the store once, on the
  // first boot against it. After that the /settings/review screen owns them,
  // so a restart cannot quietly undo what the team changed there.
  if (await initializeSettings(store, config)) {
    dim("Adopted komodo.yaml's review settings; the settings screen owns them now.");
  }

  const team = await applyTeamConfig(store, config);
  if (team.teamId) {
    dim(`Watching ${team.repositories} repos for ${team.members} teammates.`);
  } else if (opts.seed) {
    const { repositories } = await store.snapshot();
    if (repositories.length === 0) {
      dim("No team configured — seeding a sample queue.");
      await seedStore(store);
    }
  } else {
    console.log(
      pc.yellow(
        "No team configured. Add a `team:` block to komodo.yaml with the " +
          "GitHub logins and repos to watch, or the queue stays empty.",
      ),
    );
  }

  const controller = new AbortController();
  const ingest = opts.poll
    ? startIngest({ store, config, opts, dim, signal: controller.signal })
    : Promise.resolve();

  const web = startWebServer({
    port,
    dbTarget,
    // The app posts receipts, and a receipt carries a link back here. Only
    // this process knows where komodo.yaml was found.
    configDir: configPath ? dirname(configPath) : process.cwd(),
    // The app used to seed itself whenever the store was empty. On a
    // deployment that invents repositories and pull requests the team does
    // not have, so the decision is made here and passed down.
    seed: opts.seed ?? false,
    onExit: (code) => {
      if (code !== 0 && code !== null) {
        console.error(pc.red(`Web server exited with code ${code}.`));
      }
      controller.abort();
    },
  });

  // Link straight to the queue: the bare host only redirects once it knows
  // which organization slug the store ended up with.
  const { organization } = await store.snapshot();
  const url = `http://localhost:${port}/${organization.slug}/-/queue`;
  console.log(`\n🦎 Komodo ${opts.label} → ${pc.bold(pc.cyan(url))}`);
  console.log(
    pc.dim(`Store ${redact(dbTarget)}${configPath ? `\nConfig ${configPath}` : ""}`),
  );
  console.log(pc.dim("Ctrl+C to stop"));

  const stop = () => {
    controller.abort();
    web.kill("SIGTERM");
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  await ingest;
  await new Promise<void>((done) => web.once("exit", () => done()));
  store.close();
}

/** Connection strings carry passwords, and this line goes to a terminal. */
function redact(target: string): string {
  return isPostgresUrl(target) ? target.replace(/\/\/[^@]*@/, "//***@") : target;
}

function startIngest(args: {
  store: KomodoStore;
  config: ReturnType<typeof loadConfig>["config"];
  opts: ServeOptions;
  dim: (msg: string) => void;
  signal: AbortSignal;
}): Promise<void> {
  const { store, config, opts, dim, signal } = args;

  let github: GitHubClient;
  let token: string;
  try {
    token = resolveGithubToken();
    github = new GitHubClient(token);
  } catch {
    // No token is a normal state on a first run — the seeded queue still
    // renders, and the message says exactly what unlocks the real one.
    console.log(
      pc.yellow(
        "No GitHub token found. Run `gh auth login` or set GITHUB_TOKEN to " +
          "poll real pull requests.",
      ),
    );
    return Promise.resolve();
  }

  let provider: ReviewProvider | undefined;
  try {
    provider = createProvider(config, opts.provider);
  } catch {
    dim("No review provider configured; polling without reviewing.");
  }

  // `komodo pr` reviews with the repository on disk and the server did not,
  // which made the same review weaker here for no reason anyone chose.
  const checkout = opts.checkout
    ? createCheckout({
        cacheDir: resolve(opts.repoCache ?? join(process.cwd(), ".komodo", "repos")),
        token,
        onProgress: dim,
      })
    : undefined;
  if (!checkout) dim("Working trees disabled; reviews see the diff alone.");

  return runIngestLoop({
    store,
    github,
    provider,
    config,
    intervalMs: parseInt(opts.interval, 10) * 1000,
    post: opts.post,
    checkout,
    signal,
    onProgress: dim,
  });
}
