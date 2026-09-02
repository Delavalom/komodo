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
import { META_DISCOVERY_REQUESTED_AT } from "@komodo/store";
import {
  GitHubClient,
  loadConfig,
  renderOutcome,
  resolveGithubToken,
  WALKTHROUGH_MARKER,
  type HumanReviewEvent,
  type PRRef,
} from "@komodo/core";

/**
 * The review events this deployment will submit, named at runtime.
 *
 * A type cannot refuse anything here — it is gone by the time a server action
 * is called, and a server action is callable directly.
 */
const HUMAN_REVIEW_EVENTS: HumanReviewEvent[] = [
  "COMMENT",
  "REQUEST_CHANGES",
  "APPROVE",
];

import { BUCKET_ORDER } from "@/components/review/labels";
import {
  ACTOR_COOKIE,
  resolveActorLogin,
  resolveDeclaredActor,
} from "@/lib/data/actor";
import { getStore } from "@/lib/data/server";
import { loadConversation, parsePrId } from "@/lib/data/conversation";
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
 * still be working from its own schedule. It records the request instead, and
 * the next pass serves it; on the default interval that is within a minute.
 *
 * This is now the *only* thing that lists an owner, unless new repositories are
 * set to arrive enabled — discovery stopped running on its own, because an
 * organisation with hundreds of repositories was paying for the listing every
 * minute and getting hundreds of rows it never asked for.
 *
 * A request timestamp rather than clearing the heartbeat, which is what this
 * used to write: "last repo scan" is on the screen next to the button, and
 * resetting it to never every time someone pressed the button made the one fact
 * the screen had about scanning untrue.
 */
export async function rescanRepositories(): Promise<void> {
  await (await getStore()).setMeta(
    META_DISCOVERY_REQUESTED_AT,
    String(Date.now()),
  );
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
 * Re-reads a pull request's conversation from GitHub.
 *
 * The cache refreshes itself on a few minutes' staleness, which is right for
 * somebody reading. It is wrong for somebody who has just replied on GitHub in
 * another tab and wants to see it here, and this is the button for that.
 *
 * Returns the failure rather than throwing it. A deployment with no GitHub
 * token is a normal state — `komodo dev` on a laptop has none — and a button
 * that takes the whole screen down when it is pressed there is worse than one
 * that says why it could not do anything. The cached conversation is still on
 * screen behind the message, which is the useful half.
 */
export async function refreshConversation(prId: string): Promise<string | null> {
  const view = await loadConversation(prId, { force: true });
  revalidatePath("/", "layout");
  return view.error;
}

/**
 * Says something on the pull request, as the person at this browser.
 *
 * Two shapes, because GitHub has two: a reply belongs to the thread it answers
 * and goes to the review-comment endpoint, and everything else is a comment on
 * the pull request itself. Getting that wrong does not fail quietly — it 404s —
 * but the id is checked here anyway, because a server action is callable
 * directly and the client's "only inline threads have a reply box" is a
 * decoration rather than a rule.
 *
 * Attribution is the honest part. With the actor's own GitHub credential this
 * posts as them. Without one it posts as the deployment and says whose words
 * they are in the body, because a comment that reads as the bot's opinion when
 * it is a person's is a comment nobody can act on.
 *
 * Returns the failure rather than throwing it, for the same reason
 * `refreshConversation` does: a production React build redacts a thrown server
 * action error to "Minified React error #441", and the most common failure of
 * this button — a deployment with no GitHub token — deserves better than that.
 */
export async function postConversationComment(input: {
  prId: string;
  body: string;
  /** GitHub's id for the inline comment being answered, when it is a reply. */
  inReplyToId?: number | null;
}): Promise<string | null> {
  try {
    await sendConversationComment(input);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

async function sendConversationComment(input: {
  prId: string;
  body: string;
  inReplyToId?: number | null;
}): Promise<void> {
  const trimmed = input.body.trim();
  if (!trimmed) throw new Error("An empty comment says nothing.");

  const ref = parsePrId(input.prId);
  if (!ref) throw new Error(`Not a pull request id: ${input.prId}`);

  const store = await getStore();
  const { members } = await store.snapshot();
  const actorLogin = await resolveActorLogin(members);
  const actor = members.find(
    (member) => member.githubLogin.toLowerCase() === actorLogin.toLowerCase(),
  );

  // A reply has to answer something on this pull request, and something that
  // can be replied to. GitHub's reply endpoint is keyed on a review comment;
  // handed an issue comment's id it 404s, and handed another pull request's it
  // would post somewhere nobody asked for.
  if (input.inReplyToId) {
    const cached = await store.loadPullRequestConversation(input.prId);
    const target = cached?.comments.find(
      (comment) =>
        comment.kind === "review" && comment.externalId === input.inReplyToId,
    );
    if (!target) {
      throw new Error(
        "That comment is not an inline comment on this pull request, so there is no thread to reply to.",
      );
    }
  }

  const own = actor ? await store.loadGithubToken(actor.id) : null;
  const github = new GitHubClient(own?.token ?? resolveGithubToken());
  // Signed only when the credential is not the person's own. Signing their own
  // comment with their own name is GitHub's job, and doing it twice is noise.
  const body = own ? trimmed : `${trimmed}\n\n*Posted from Komodo by ${actorLogin}.*`;

  if (input.inReplyToId) {
    await github.replyToReviewComment(ref, input.inReplyToId, body);
  } else {
    await github.createIssueComment(ref, body);
  }

  // Re-read rather than append the comment we just made: GitHub assigns the id
  // and the timestamps, and a locally-invented row would differ from the one
  // the next fetch brings back.
  await loadConversation(input.prId, { force: true });
  revalidatePath("/", "layout");
}

/* ── Acting on GitHub as yourself ────────────────────────────────────────── */

/**
 * Connects the person at this browser to their own GitHub account.
 *
 * Komodo's deployment token posts Komodo's own comments, and that is right for
 * them — they are Komodo's. A human review is not. An approval submitted with
 * a shared token puts the shared account on GitHub's record, and "the bot
 * approved it" is not an audit trail anybody can use.
 *
 * The login is read back from GitHub rather than taken on trust: a token that
 * belongs to a different account than the roster says would file one person's
 * approvals under another's name, and only GitHub can settle which account a
 * token is. A mismatch is refused here, where the message can explain it,
 * rather than at review time.
 */
export async function connectGithubIdentity(
  token: string,
): Promise<{ login: string; error?: undefined } | { login?: undefined; error: string }> {
  try {
    return { login: await saveGithubIdentity(token) };
  } catch (err) {
    // Returned rather than thrown: a production React build redacts a thrown
    // server action error to "Minified React error #441", and "GitHub would
    // not accept that token" is the entire value of this call failing.
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function saveGithubIdentity(token: string): Promise<string> {
  const trimmed = token.trim();
  if (!trimmed) throw new Error("Paste a GitHub token.");

  const store = await getStore();
  const { members } = await store.snapshot();
  // Declared, not inferred: connecting a credential is the moment the person
  // says which of them they are, and falling back to `team.you` would attach
  // somebody's token to a name they never chose.
  const actor = await resolveDeclaredActor(members);
  if (!actor) {
    throw new Error(
      "Nobody is marked as you on this device. Pick your name from the account menu before connecting an account.",
    );
  }

  let identity;
  try {
    identity = await new GitHubClient(trimmed).getViewer();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`GitHub would not accept that token: ${detail}`);
  }

  if (identity.login.toLowerCase() !== actor.githubLogin.toLowerCase()) {
    throw new Error(
      `That token belongs to ${identity.login}, but this browser is acting as ${actor.githubLogin}. Connect the token for ${actor.githubLogin}, or change who you are in the account menu.`,
    );
  }

  await store.saveGithubIdentity({
    memberId: actor.id,
    login: identity.login,
    token: trimmed,
  });
  revalidatePath("/", "layout");
  return identity.login;
}

export async function disconnectGithubIdentity(): Promise<void> {
  const store = await getStore();
  const { members } = await store.snapshot();
  const actor = await resolveDeclaredActor(members);
  if (!actor) return;

  await store.deleteGithubIdentity(actor.id);
  revalidatePath("/", "layout");
}

/**
 * Submits a GitHub review, as the person who pressed the button.
 *
 * The one place in Komodo that can produce an approval, and it is deliberately
 * the only one. The reviewer pipeline calls `postReview`, which hardcodes
 * COMMENT and cannot be told otherwise; this calls `submitHumanReview`, which
 * takes the event as an argument because a person chose it — and it will not
 * run at all without that person's own credential, so GitHub records who
 * actually decided.
 *
 * Three refusals, each for a different way of approving something you have not
 * reviewed:
 *
 *   - No connected token. There is no honest way to attribute this.
 *   - The head has moved. An approval names a commit; approving a run of code
 *     that has been pushed past is the quietest way a review gets invalidated.
 *   - A required verification check is unverified, and the caller did not say
 *     out loud that they are going ahead anyway. Komodo's whole argument is
 *     that a clean diff is not evidence the change works.
 */
export async function submitGithubReview(input: {
  reviewId: string;
  event: HumanReviewEvent;
  body: string;
  /** Set when approving with required checks still unverified, and why. */
  override?: string | null;
}): Promise<{ url: string; error?: undefined } | { url?: undefined; error: string }> {
  try {
    return { url: await sendGithubReview(input) };
  } catch (err) {
    // Returned rather than thrown — see connectGithubIdentity. Every refusal
    // here is one the person can act on, and a redacted React error is not.
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function sendGithubReview(input: {
  reviewId: string;
  event: HumanReviewEvent;
  body: string;
  override?: string | null;
}): Promise<string> {
  // Named exhaustively rather than trusted from the argument's type. A server
  // action is callable directly, the type is erased by then, and the approve
  // gate below is a string comparison — so an event this code has never heard
  // of would sail past it into GitHub.
  if (!HUMAN_REVIEW_EVENTS.includes(input.event)) {
    throw new Error(`${String(input.event)} is not a review event.`);
  }

  const body = input.body.trim();
  if (!body) throw new Error("A review with nothing written in it says nothing.");

  const store = await getStore();
  const detail = await store.loadReview(input.reviewId);
  if (!detail) throw new Error("That review run is no longer in the store.");

  const snapshot = await store.snapshot();
  // No fallback to `team.you`. Everywhere else in Komodo an unset cookie means
  // the deployment's owner, which is right for a ledger and wrong for this:
  // a request with no cookie is not a person, and submitting a GitHub review
  // under somebody's name on that basis is exactly what must not happen.
  const actor = await resolveDeclaredActor(snapshot.members);
  if (!actor) {
    throw new Error(
      "Nobody is marked as you on this device. Pick your name from the account menu before submitting a review.",
    );
  }

  const own = await store.loadGithubToken(actor.id);
  if (!own) {
    throw new Error(
      "Connect your own GitHub account first, under Personal → Connections. A review posted with the deployment's token would be recorded by GitHub as the deployment's, not yours.",
    );
  }

  const pr = snapshot.pullRequests.find(
    (candidate) => candidate.id === detail.review.prId,
  );
  if (!pr) throw new Error("That pull request is no longer in the inventory.");

  // A repository somebody switched off is one this deployment was told to stop
  // touching, and reaching out to GitHub about it is touching it. The remote
  // submission route refuses the same thing for the same reason.
  if (!snapshot.repositories.find((repo) => repo.id === pr.repoId)?.enabled) {
    throw new Error(`${pr.repoId} is switched off in Manage Repositories.`);
  }
  if (pr.state !== "open") {
    throw new Error(
      `${pr.id} is ${pr.state}. A review of a pull request that is already closed changes nothing and confuses its history.`,
    );
  }
  if (pr.headSha !== detail.review.headSha) {
    throw new Error(
      `This review read ${detail.review.headSha.slice(0, 12)}, and the pull request is now at ${pr.headSha.slice(0, 12)}. Review the current head before submitting.`,
    );
  }

  const outstanding = unverifiedRequired(detail);
  const override = input.override?.trim();
  if (input.event === "APPROVE" && outstanding > 0 && !override) {
    throw new Error(
      `${outstanding} required verification ${outstanding === 1 ? "check is" : "checks are"} not verified. Record the evidence, or say why you are approving without it.`,
    );
  }

  const ref = parseReviewId(input.reviewId);
  // The note is appended only to an approval, and only when there was
  // something to approve over. Keyed on the override alone it wrote the word
  // "Approved" into comments and change requests, which is Komodo putting a
  // decision in a reviewer's mouth that they did not make.
  const posted =
    input.event === "APPROVE" && override && outstanding > 0
      ? `${body}\n\n> Approved with ${outstanding} required check${outstanding === 1 ? "" : "s"} unverified: ${override}`
      : body;

  let submitted;
  try {
    submitted = await new GitHubClient(own.token).submitHumanReview(ref, {
      event: input.event,
      body: posted,
      headSha: detail.review.headSha,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Recorded so the settings screen can say the credential stopped working,
    // rather than leaving the button failing with no explanation anywhere.
    if (/401|403|Bad credentials/i.test(message)) {
      await store.setGithubIdentityError(own.identity.memberId, message.slice(0, 300));
    }
    throw new Error(`GitHub refused the review: ${message}`);
  }

  // The poller would learn this within a minute — submitting a review moves
  // the pull request's `updatedAt`, so the next pass re-reads the decisions.
  // Writing it now means the queue's human-review column agrees with what just
  // happened rather than with what GitHub said sixty seconds ago.
  //
  // Re-read immediately before the write rather than reusing the row from
  // above: the poller may have moved the head while this was in flight, and
  // upserting the older row would put the stale head back — which would then
  // make the head-moved gate pass on a commit that has been pushed past.
  const current = (await store.listPullRequests()).find(
    (candidate) => candidate.id === pr.id,
  );
  if (current) {
    await store.upsertPullRequest(
      applyReviewDecision(current, own.identity.login, input.event),
    );
  }
  await loadConversation(detail.review.prId, { force: true }).catch(() => undefined);
  revalidatePath("/", "layout");
  return submitted.html_url;
}

/** Required checks whose newest entry is not `verified`. */
function unverifiedRequired(detail: {
  verificationRequirements: import("@/lib/types").VerificationRequirement[];
  verifications: import("@/lib/types").VerificationEntry[];
}): number {
  const latest = new Map(
    detail.verifications.map((entry) => [entry.requirementId, entry]),
  );
  return detail.verificationRequirements.filter(
    (check) => check.required && latest.get(check.id)?.result !== "verified",
  ).length;
}

/**
 * The pull request row, with this reviewer's decision applied.
 *
 * Only the latest review per person counts — the same rule
 * `listReviewDecisions` applies when the poller reads them — so a login moves
 * between the two lists rather than appearing in both. A COMMENT is not a
 * decision and removes them from neither.
 */
function applyReviewDecision(
  pr: import("@/lib/types").PullRequest,
  login: string,
  event: HumanReviewEvent,
): import("@komodo/store").PullRequestInput {
  const without = (list: string[]) =>
    list.filter((entry) => entry.toLowerCase() !== login.toLowerCase());

  if (event === "COMMENT") return pr;
  return {
    ...pr,
    approvals: event === "APPROVE" ? [...without(pr.approvals), login] : without(pr.approvals),
    changesRequested:
      event === "REQUEST_CHANGES"
        ? [...without(pr.changesRequested), login]
        : without(pr.changesRequested),
  };
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
