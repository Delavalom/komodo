"use server";

/**
 * Write seam's server half.
 *
 * A shared queue cannot be mutated in a browser's localStorage, so every write
 * against a store-owned entity is a server action: it goes through the port
 * and then revalidates, and the next render picks the change up for everyone
 * rather than for one tab.
 *
 * The hooks in lib/data/mutations.ts wrap these, so callers did not move.
 */
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { mintApiKey } from "@komodo/store/api-key";
import { META_LAST_DISCOVERY_AT } from "@komodo/store";
import {
  GitHubClient,
  loadConfig,
  renderOutcome,
  resolveGithubToken,
  WALKTHROUGH_MARKER,
  type PRRef,
} from "@komodo/core";

import { BUCKET_ORDER } from "@/components/review/labels";
import { ACTOR_COOKIE, resolveActorLogin } from "@/lib/data/actor";
import { getStore } from "@/lib/data/server";
import {
  recordVerificationForActor,
  type VerificationSubmission,
} from "@/lib/data/verification";
import type {
  Answer,
  Bucket,
  Integration,
  Member,
  MemoryRule,
  OrgSettings,
  ReviewJudgement,
} from "@/lib/types";

export async function setRepoEnabled(
  repoId: string,
  enabled: boolean,
): Promise<void> {
  await (await getStore()).setRepoEnabled(repoId, enabled);
  revalidatePath("/", "layout");
}

/**
 * Changes how this deployment reviews.
 *
 * A patch, not a whole object: the settings screen saves one control at a
 * time, and the ingester re-reads the row on every pass — so this takes
 * effect on the next poll rather than on the next restart.
 */
export async function updateOrgSettings(
  patch: Partial<OrgSettings>,
): Promise<void> {
  await (await getStore()).saveSettings(patch);
  revalidatePath("/", "layout");
}

/**
 * Asks for the repository listing to be re-read on the next poll.
 *
 * The poller lives in another process — `komodo serve` starts both — so this
 * cannot call GitHub and have the result mean anything: the ingester would
 * still be working from its own schedule. It clears the discovery heartbeat
 * instead, which is the same trick `retriggerReviews` uses. The next pass sees
 * a listing older than the interval and lists again, inside a minute on the
 * default settings.
 */
export async function rescanRepositories(): Promise<void> {
  await (await getStore()).setMeta(META_LAST_DISCOVERY_AT, "0");
  revalidatePath("/", "layout");
}

export async function retriggerReviews(judgmentIds: string[]): Promise<void> {
  const store = await getStore();
  await store.retriggerReviews(judgmentIds);
  await store.setMeta("review.providerPausedUntil", "0");
  revalidatePath("/", "layout");
}

/** Queue one immutable current head for the local or interactive worker. */
export async function requestAIReview(
  prId: string,
  expectedHeadSha: string,
): Promise<void> {
  const store = await getStore();
  const snapshot = await store.snapshot();
  const pr = snapshot.pullRequests.find((candidate) => candidate.id === prId);
  if (!pr || pr.state !== "open") {
    throw new Error("That pull request is no longer open.");
  }
  if (pr.headSha !== expectedHeadSha) {
    throw new Error("The pull request changed. Reload before requesting a review.");
  }

  await store.requestAIReview({
    prId,
    headSha: pr.headSha,
    trigger: "manual",
    requestedBy: await resolveActorLogin(snapshot.members),
    requestedAt: Date.now(),
  });
  // An explicit retry means the operator believes the provider is usable
  // again; do not leave it behind the automatic failure circuit.
  await store.setMeta("review.providerPausedUntil", "0");
  revalidatePath("/", "layout");
}

/**
 * Says which member of the roster is using this browser.
 *
 * A preference, not a sign-in: it changes whose name the ledger records and
 * nothing else. Anyone who can reach the queue could already act as anyone,
 * so this grants no access it did not have — it only stops four people's
 * decisions being filed under one name.
 */
export async function setActor(githubLogin: string): Promise<void> {
  const { members } = await (await getStore()).snapshot();
  const member = members.find(
    (m) => m.githubLogin.toLowerCase() === githubLogin.toLowerCase(),
  );
  if (!member) throw new Error(`${githubLogin} is not on this team's roster.`);

  (await cookies()).set(ACTOR_COOKIE, member.githubLogin, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}

export async function inviteMember(email: string): Promise<void> {
  const store = await getStore();
  const { members } = await store.snapshot();
  if (members.some((m) => m.email === email)) return;

  // The roster is keyed on the GitHub login, and an invite only carries an
  // email. The local part is the best guess available until they connect an
  // account; the settings screen is where it gets corrected.
  const login = email.split("@")[0];
  await store.saveMember({
    email,
    name: login,
    githubLogin: login,
    role: "member",
    avatarSeed: email,
    isYou: false,
  });
  revalidatePath("/", "layout");
}

/**
 * Corrects a teammate's row.
 *
 * The GitHub login is the join key between a person and their pull requests:
 * a wrong one means the queue's "mine" lens is empty for them forever and
 * nobody can tell why. Invites can only guess it from an email address, and
 * until now there was nowhere to fix the guess — the invite dialog said to
 * correct it here, on a screen with no control that could.
 */
export async function updateMember(
  memberId: string,
  patch: { githubLogin?: string; name?: string; role?: Member["role"] },
): Promise<void> {
  const store = await getStore();
  const { members } = await store.snapshot();
  const existing = members.find((m) => m.id === memberId);
  if (!existing) throw new Error("That teammate is no longer on the roster.");

  const githubLogin = patch.githubLogin?.trim() || existing.githubLogin;
  const clash = members.find(
    (m) => m.id !== memberId && m.githubLogin.toLowerCase() === githubLogin.toLowerCase(),
  );
  if (clash) throw new Error(`${githubLogin} is already on the roster.`);

  // A whole row: the port's writer replaces rather than patches.
  await store.saveMember({
    ...existing,
    githubLogin,
    name: patch.name?.trim() || existing.name,
    role: patch.role ?? existing.role,
  });
  revalidatePath("/", "layout");
}

export async function removeMember(memberId: string): Promise<void> {
  await (await getStore()).removeMember(memberId);
  revalidatePath("/", "layout");
}

/**
 * One entry in the decision ledger.
 *
 * The ledger is append-only, so this never edits anything: choosing again
 * appends, and `bucket: null` withdraws by appending too. What a team decided,
 * and when they changed their minds, is the record this app exists to keep.
 */
export async function answerJudgement(input: {
  judgementId: string;
  bucket: Bucket | null;
  optionLabel?: string | null;
  note?: string | null;
  blocking?: boolean;
}): Promise<void> {
  const store = await getStore();
  const { members } = await store.snapshot();

  await store.recordAnswer({
    ...input,
    // Whoever this device says it is — see lib/data/actor.ts. Not a
    // credential, but enough that a shared deployment's ledger names four
    // people rather than one.
    actorLogin: await resolveActorLogin(members),
  });
  revalidatePath("/", "layout");
}

/** Records what a person observed, never an approval or credential check. */
export async function recordVerification(
  input: VerificationSubmission,
): Promise<void> {
  const store = await getStore();
  const snapshot = await store.snapshot();
  await recordVerificationForActor(
    input,
    await resolveActorLogin(snapshot.members),
  );
  revalidatePath("/", "layout");
}

/**
 * Connects a tracker.
 *
 * The token is stored on the deployment and read by the ingester alone, which
 * uses it for one thing: fetching the issue a pull request names, so a review
 * can weigh the change against what was asked for. It is never returned to a
 * browser again — `listIntegrations` does not carry it.
 */
export async function connectIntegration(input: {
  provider: Integration["provider"];
  token: string;
  baseUrl?: string;
  account?: string;
}): Promise<void> {
  await (await getStore()).saveIntegration(input);
  revalidatePath("/", "layout");
}

export async function disconnectIntegration(id: string): Promise<void> {
  await (await getStore()).disconnectIntegration(id);
  revalidatePath("/", "layout");
}

/**
 * Mints an API key.
 *
 * The secret comes back exactly once, in this return value, and is never
 * stored — only its SHA-256 is. That is the whole reason this is a server
 * action rather than the client-side generator it replaced: a key generated
 * in a browser and kept in localStorage authenticated nothing and protected
 * nobody, because there was no API on the other side of it.
 */
export async function createApiKey(
  name: string,
): Promise<{ id: string; secret: string }> {
  const minted = mintApiKey();
  const key = await (await getStore()).createApiKey({
    name,
    keyHash: minted.keyHash,
    prefix: minted.prefix,
  });
  revalidatePath("/", "layout");
  return { id: key.id, secret: minted.secret };
}

export async function deleteApiKey(keyId: string): Promise<void> {
  await (await getStore()).deleteApiKey(keyId);
  revalidatePath("/", "layout");
}

/**
 * What a rule needs to exist.
 *
 * `status` is not here: a rule is created active. There is no case for
 * writing one down and switching it off in the same breath.
 */
export interface NewMemoryRule {
  description: string;
  kind: MemoryRule["kind"];
  /** The rule text, or for a file rule the glob naming what to read. */
  pattern: string;
  repoId: string | null;
  fileGlob: string;
}

/**
 * Teaches Komodo something.
 *
 * These reach the reviewer: the ingester matches every active rule against
 * each pull request's repository and changed files, and hands what survives
 * to the model with the diff. Before this they were browser state — writable,
 * scopeable, countable, and read by nothing.
 */
export async function createMemoryRule(input: NewMemoryRule): Promise<string> {
  const id = await (await getStore()).saveMemoryRule({ ...input, status: "active" });
  revalidatePath("/", "layout");
  return id;
}

export async function updateMemoryRule(
  id: string,
  patch: Partial<MemoryRule>,
): Promise<void> {
  const store = await getStore();
  const existing = (await store.listMemoryRules()).find((r) => r.id === id);
  if (!existing) return;

  // A whole row, not a patch: the port's writer replaces, and sending only
  // the changed fields would blank the rest.
  await store.saveMemoryRule({
    id,
    description: patch.description ?? existing.description,
    kind: patch.kind ?? existing.kind,
    pattern: patch.pattern ?? existing.pattern,
    repoId: patch.repoId === undefined ? existing.repoId : patch.repoId,
    fileGlob: patch.fileGlob ?? existing.fileGlob,
    status: patch.status ?? existing.status,
  });
  revalidatePath("/", "layout");
}

export async function deleteMemoryRule(id: string): Promise<void> {
  await (await getStore()).deleteMemoryRule(id);
  revalidatePath("/", "layout");
}

export async function createRepoCluster(
  name: string,
  memberRepoIds: string[],
): Promise<string> {
  const id = await (await getStore()).saveRepoCluster({ name, memberRepoIds });
  revalidatePath("/", "layout");
  return id;
}

export async function deleteRepoCluster(id: string): Promise<void> {
  await (await getStore()).deleteRepoCluster(id);
  revalidatePath("/", "layout");
}

/**
 * Records what someone thought of a judgement — was it worth raising?
 *
 * Separate from answering, and deliberately so. An answer is a decision about
 * the code; a vote is an opinion about the reviewer. Conflating them would
 * mean you could not say "good catch, but we are not doing it" — which is
 * most of what a team actually thinks about a review.
 *
 * Unlike the answer ledger this keeps no history: one row per person per
 * judgement, replaced on a change of mind.
 */
export async function voteJudgement(input: {
  judgementId: string;
  value: 1 | -1 | null;
}): Promise<void> {
  const store = await getStore();
  const { members } = await store.snapshot();

  await store.recordVote({
    ...input,
    actorLogin: await resolveActorLogin(members),
  });
  revalidatePath("/", "layout");
}

/**
 * Closes a review out: the answers become a comment on the pull request.
 *
 * It upserts the same marker the pipeline's receipt uses, so the one Komodo
 * comment on a pull request is replaced in place — "3 judgements waiting on a
 * human" becomes what the team decided. Posting again after more answers is
 * the same call, which is why the receipt is a comment and not a review.
 *
 * Unlike the CLI's store write, this does not swallow its failures. A missing
 * token is worth an exception here: nothing has been lost, and the person who
 * pressed the button is waiting to hear whether it worked.
 */
export async function postReceipt(reviewId: string): Promise<string> {
  const store = await getStore();
  const detail = await store.loadReview(reviewId);
  if (!detail) throw new Error("That review run is no longer in the store.");

  // Every id here is derived, so the pull request the comment belongs on comes
  // out of the review id itself: `${owner}/${repo}#${number}@${headSha}`.
  const ref = parseReviewId(reviewId);

  const answerFor = new Map<string, Answer>(
    detail.answers.map((a) => [a.judgementId, a]),
  );
  const decided = detail.judgements
    .map((j) => ({ judgement: j, answer: answerFor.get(j.id) }))
    .filter((row): row is { judgement: ReviewJudgement; answer: Answer } =>
      Boolean(row.answer?.bucket),
    );

  const counts = new Map<Bucket, number>();
  for (const { answer } of decided) {
    counts.set(answer.bucket!, (counts.get(answer.bucket!) ?? 0) + 1);
  }

  const body = renderOutcome(
    {
      headSha: detail.review.headSha,
      confidence: detail.review.confidence,
      verdictLine: detail.review.verdictLine,
      tally: BUCKET_ORDER.filter((b) => counts.get(b)).map((bucket) => ({
        bucket,
        count: counts.get(bucket)!,
      })),
      decisions: decided.map(({ judgement, answer }) => ({
        bucket: answer.bucket!,
        title: judgement.title,
        note: answer.note,
      })),
      unanswered: detail.judgements.length - decided.length,
      verification: verificationOutcome(detail),
    },
    reviewPermalink(ref, detail.review.headSha),
  );

  const github = new GitHubClient(resolveGithubToken());
  const comment = await github.upsertWalkthroughComment(
    ref,
    WALKTHROUGH_MARKER,
    body,
  );

  await store.markReceiptPosted(reviewId, comment.html_url);
  revalidatePath("/", "layout");
  return comment.html_url;
}

function verificationOutcome(detail: {
  verificationRequirements: import("@/lib/types").VerificationRequirement[];
  verifications: import("@/lib/types").VerificationEntry[];
}) {
  const latest = new Map(
    detail.verifications.map((entry) => [entry.requirementId, entry]),
  );
  const required = detail.verificationRequirements.filter((check) => check.required);
  return {
    required: required.length,
    verified: required.filter((check) => latest.get(check.id)?.result === "verified")
      .length,
    failed: required.filter((check) => latest.get(check.id)?.result === "failed").length,
    blocked: required.filter((check) => latest.get(check.id)?.result === "blocked")
      .length,
  };
}

function parseReviewId(reviewId: string): PRRef {
  const match = /^([^/]+)\/([^#]+)#(\d+)@/.exec(reviewId);
  if (!match) throw new Error(`Not a review id: ${reviewId}`);
  return { owner: match[1], repo: match[2], number: Number(match[3]) };
}

/**
 * The slug-less permalink `@komodo/core` would have written. This deployment
 * knows its own organization, but the comment outlives the slug, so it links
 * at the `/-/pr/...` route that resolves one — the same shape `komodoReviewUrl`
 * builds in packages/core/src/pipeline.ts.
 */
function reviewPermalink(ref: PRRef, headSha: string): string {
  // KOMODO_CONFIG_DIR is set by the CLI that spawned this server. Without it
  // loadConfig() searches process.cwd(), which for a Next standalone bundle is
  // the bundle's own directory — komodo.yaml is never there, so every receipt
  // would link at the default localhost:4400 no matter what `local.url` says.
  const base = loadConfig(process.env.KOMODO_CONFIG_DIR || process.cwd())
    .config.local.url.replace(/\/$/, "");
  return `${base}/-/pr/${ref.owner}/${ref.repo}/${ref.number}?run=${headSha}`;
}
