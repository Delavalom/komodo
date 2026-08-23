import "server-only";

/**
 * The read seam's server half.
 *
 * Everything shared loads here, once per request, and is handed to the client
 * as a snapshot. This is the line that makes the queue a team's queue rather
 * than a browser's: the same rows for whoever opens the page.
 *
 * Which driver backs it is an env decision and nothing above this file knows
 * the answer — that is what lets `komodo dev` and `komodo serve` run the same
 * app.
 */
import { connectStore } from "@komodo/store/connect";
import { seedStore } from "@komodo/store/seed";
import { resolveActor } from "@/lib/data/actor";
import type {
  KomodoStore,
  QueueSnapshot,
  Review,
  ReviewDetail,
  ReviewFile,
} from "@komodo/store";

const DEFAULT_DB = ".komodo/komodo.db";

/**
 * One handle for the process. Next re-executes modules per request in dev, so
 * this hangs off globalThis — otherwise every reload leaks another open
 * database.
 */
const handle = globalThis as typeof globalThis & {
  __komodoStore?: Promise<KomodoStore>;
};

async function connect(): Promise<KomodoStore> {
  // A postgres:// URL is the team deployment, a path is the local one. The
  // app cannot tell which it got, which is the point.
  // Empty strings are a real possibility from a process manager, and they are
  // not nullish — so this filters on truthiness, not on `??`.
  const target =
    process.env.DATABASE_URL || process.env.KOMODO_DB || DEFAULT_DB;
  const store = await connectStore(target);

  // An empty database on a laptop means nobody has run the ingester yet, and
  // seeding beats opening on empty tables and looking broken. On a deployment
  // the same line invents repositories and pull requests the team does not
  // have — indistinguishable, in the UI, from real ones. So it is opt-in:
  // `komodo dev` asks for it, `komodo serve` does not, and `next dev` gets it
  // from .env.development.
  if (process.env.KOMODO_SEED === "1") {
    const { repositories } = await store.snapshot();
    if (repositories.length === 0) await seedStore(store);
  }

  return store;
}

export function getStore(): Promise<KomodoStore> {
  handle.__komodoStore ??= connect();
  return handle.__komodoStore;
}

/**
 * The clock, read on the server, once per request.
 *
 * A function rather than an expression at the call site: every age the app
 * renders is measured from this, and reading `Date.now()` inside a component —
 * even a server one — is a call React is entitled to run twice and get two
 * answers for. Here it is plain module code, and the value it returns travels
 * down as a prop.
 */
export function requestNow(): number {
  return Date.now();
}

export async function loadSnapshot(): Promise<QueueSnapshot> {
  const snapshot = await (await getStore()).snapshot();

  // `isYou` is stored as whatever komodo.yaml's `team.you` names, which is
  // right for a one-person install and wrong for a shared one: it made the
  // header, the "mine" lens and the answer ledger all describe the same
  // person no matter who was actually at the keyboard. The store keeps the
  // deployment's default; this re-points it at whoever this device says it
  // is, so what the queue shows and what the ledger records agree.
  const actor = await resolveActor(snapshot.members);
  if (!actor) return snapshot;

  return {
    ...snapshot,
    members: snapshot.members.map((m) => ({ ...m, isYou: m.id === actor.id })),
  };
}

/**
 * One review run, read on its own.
 *
 * Deliberately outside the snapshot: a run carries every judgement body the
 * reviewer wrote and, behind them, the patches. The snapshot is loaded once
 * per request for every page in the app, and this belongs to exactly one.
 */
export async function loadReview(
  reviewId: string,
): Promise<ReviewDetail | null> {
  return (await getStore()).loadReview(reviewId);
}

/** The newest run for a pull request — what the detail page opens on. */
export async function loadLatestReview(
  prId: string,
): Promise<ReviewDetail | null> {
  return (await getStore()).loadLatestReview(prId);
}

/** Every run, newest first. History here is never overwritten. */
export async function loadReviewRuns(prId: string): Promise<Review[]> {
  return (await getStore()).listReviewRuns(prId);
}

/** The patches, read only when someone opens the diff. */
export async function loadReviewFiles(
  reviewId: string,
): Promise<ReviewFile[]> {
  return (await getStore()).loadReviewFiles(reviewId);
}
