import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, normalize } from "node:path";
import {
  GitHubClient,
  isBlocking,
  renderJudgementComment,
  renderVerdict,
  type AskResult,
  type JudgementStatus,
  type JudgementThread,
  type JudgementView,
  type PostResult,
  type PRRef,
  type QueueEntry,
  type ReviewJudgements,
  type ReviewRecord,
  type ReviewView,
  type ThreadMessage,
} from "@komodo/core";

/**
 * The file-backed implementation of the ReviewStore port.
 *
 * The cloud app keeps answers in Postgres; locally they live alongside the
 * review that produced them, in `.komodo/reviews/<id>.json`. Same shapes out,
 * so the shared screens in @komodo/ui cannot tell the two apart.
 */

/** What the reviewer decided, persisted next to what Komodo said. */
interface StoredAnswer {
  bucket: JudgementView["bucket"];
  optionLabel: string | null;
  note: string | null;
  blocking: boolean;
  status: JudgementStatus;
  githubCommentId: number | null;
}

/** The answer state a record grows once someone starts judging it. */
interface StoredState {
  /** Keyed by ordinal, so it survives the judgement list being re-read. */
  answers: Record<number, StoredAnswer>;
  messages: Record<number, ThreadMessage[]>;
}

interface StoredRecord extends ReviewRecord {
  state?: StoredState;
  postedUrl?: string | null;
  postedAt?: string | null;
}

const EMPTY_ANSWER: StoredAnswer = {
  bucket: null,
  optionLabel: null,
  note: null,
  blocking: false,
  status: "open",
  githubCommentId: null,
};

/**
 * A judgement's id, stable across reads: the record it came from plus its
 * position. Records are immutable once written, so the ordinal is a safe key.
 */
function judgementId(recordId: string, ordinal: number): string {
  return `${recordId}#${ordinal}`;
}

function parseJudgementId(id: string): { recordId: string; ordinal: number } | null {
  const at = id.lastIndexOf("#");
  if (at === -1) return null;
  const ordinal = Number(id.slice(at + 1));
  if (!Number.isInteger(ordinal) || ordinal < 0) return null;
  return { recordId: id.slice(0, at), ordinal };
}

export class LocalReviewStore {
  constructor(
    private readonly reviewsDir: string,
    private readonly github: () => GitHubClient = () => new GitHubClient(),
  ) {}

  // ---- persistence ----

  private pathFor(recordId: string): string {
    const file = join(this.reviewsDir, `${recordId}.json`);
    // Ids arrive over HTTP; keep them inside the reviews directory.
    if (!normalize(file).startsWith(normalize(this.reviewsDir))) {
      throw new Error("Bad review id.");
    }
    return file;
  }

  private read(recordId: string): StoredRecord | null {
    const file = this.pathFor(recordId);
    if (!existsSync(file)) return null;
    return migrate(JSON.parse(readFileSync(file, "utf8")), recordId);
  }

  private write(record: StoredRecord): void {
    writeFileSync(this.pathFor(record.id), JSON.stringify(record, null, 2));
  }

  private readAll(): StoredRecord[] {
    if (!existsSync(this.reviewsDir)) return [];
    return readdirSync(this.reviewsDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          return migrate(
            JSON.parse(readFileSync(join(this.reviewsDir, f), "utf8")),
            f.replace(/\.json$/, ""),
          );
        } catch {
          return null;
        }
      })
      .filter((r): r is StoredRecord => r !== null)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  // ---- reads for the read-only viewer ----

  /** The review list: one row per record, newest first. */
  listSummaries(): unknown[] {
    return this.readAll().map((record) => ({
      id: record.id,
      createdAt: record.createdAt,
      provider: record.provider ?? "unknown",
      pr: record.pr,
      confidence: record.result.confidence,
      judgements: record.result.judgements?.length ?? 0,
      posted: record.posted,
    }));
  }

  /** The whole record, as the detail screen renders it. */
  readRecord(recordId: string): StoredRecord | null {
    return this.read(recordId);
  }

  // ---- reads for the judge flow ----

  async loadQueue(): Promise<QueueEntry[]> {
    const entries: QueueEntry[] = [];

    for (const record of this.readAll()) {
      const review = toReviewView(record);
      for (const judgement of toJudgementViews(record)) {
        const waiting = judgement.bucket === null || judgement.status === "awaiting_reply";
        if (!waiting || judgement.status === "withdrawn" || judgement.status === "closed") continue;

        const ordinal = judgement.ordinal;
        const hasReply = (record.state?.messages[ordinal] ?? []).some((m) => m.role === "author");
        entries.push({ judgement, review, hasReply });
      }
    }

    return entries;
  }

  async loadReviewJudgements(reviewId: string): Promise<ReviewJudgements | null> {
    const record = this.read(reviewId);
    if (!record) return null;
    return { review: toReviewView(record), judgements: toJudgementViews(record) };
  }

  async loadThread(id: string): Promise<JudgementThread | null> {
    const parsed = parseJudgementId(id);
    if (!parsed) return null;
    const record = this.read(parsed.recordId);
    if (!record) return null;

    const judgement = toJudgementViews(record)[parsed.ordinal];
    if (!judgement) return null;

    return {
      judgement,
      review: toReviewView(record),
      messages: record.state?.messages[parsed.ordinal] ?? [],
    };
  }

  // ---- writes ----

  private mutate(id: string, fn: (answer: StoredAnswer, record: StoredRecord) => void): StoredRecord {
    const parsed = parseJudgementId(id);
    if (!parsed) throw new Error("Judgement not found.");
    const record = this.read(parsed.recordId);
    if (!record) throw new Error("Judgement not found.");

    const state = (record.state ??= { answers: {}, messages: {} });
    const answer = (state.answers[parsed.ordinal] ??= { ...EMPTY_ANSWER });
    fn(answer, record);
    this.write(record);
    return record;
  }

  async answer(id: string, optionIndex: number): Promise<void> {
    const parsed = parseJudgementId(id);
    if (!parsed) throw new Error("Judgement not found.");
    const record = this.read(parsed.recordId);
    if (!record) throw new Error("Judgement not found.");

    const option = record.result.judgements[parsed.ordinal]?.options[optionIndex];
    if (!option) throw new Error("No such option.");
    if (option.bucket === "Asked") {
      throw new Error("Use ask for the 'Asked' option — it needs a written question.");
    }

    this.mutate(id, (answer) => {
      answer.bucket = option.bucket;
      answer.optionLabel = option.label;
    });
  }

  async undoAnswer(id: string): Promise<void> {
    this.mutate(id, (answer) => {
      // A question already sent to the author cannot be silently un-asked.
      if (answer.status === "awaiting_reply") {
        throw new Error("That question is already with the author. Close the thread instead.");
      }
      Object.assign(answer, EMPTY_ANSWER);
    });
  }

  /**
   * Send the reviewer's question to the author as an inline PR comment.
   *
   * Written to disk first and posted second: if GitHub rejects it the question
   * is still recorded with `githubCommentId: null`, which the thread screen
   * surfaces as "not delivered" rather than losing what was typed.
   */
  async ask(id: string, draft: string, blocking: boolean): Promise<AskResult> {
    const question = draft.trim();
    if (!question) throw new Error("Write the question first.");

    const parsed = parseJudgementId(id)!;
    const record = this.mutate(id, (answer, rec) => {
      answer.bucket = "Asked";
      answer.optionLabel = blocking
        ? "Question sent — merge blocked until it is answered"
        : "Question sent — not blocking";
      answer.note = question;
      answer.blocking = blocking;
      answer.status = "awaiting_reply";

      const messages = (rec.state!.messages[parsed.ordinal] ??= []);
      messages.push({
        id: `${id}:${messages.length}`,
        role: "reviewer",
        authorLogin: null,
        body: question,
        createdAt: new Date().toISOString(),
      });
    });

    const judgement = record.result.judgements[parsed.ordinal];
    try {
      const github = this.github();
      const ref = refOf(record);
      // Re-fetch the head: the author may have pushed since the review ran, and
      // GitHub rejects comments anchored to a stale commit.
      const pr = await github.getPR(ref);
      const body =
        `${renderJudgementComment(judgement)}\n\n---\n\n` +
        `**A question from the reviewer:**\n\n${question}` +
        (blocking ? "\n\n<sub>Merge is blocked until this is answered.</sub>" : "");

      const comment = await github.createReviewComment(
        ref,
        pr.headSha,
        judgement.path,
        judgement.endLine ?? judgement.line,
        body,
      );

      this.mutate(id, (answer, rec) => {
        answer.githubCommentId = comment.id;
        const messages = rec.state!.messages[parsed.ordinal] ?? [];
        const last = messages[messages.length - 1];
        if (last) last.githubCommentId = comment.id;
      });
      return { delivered: true };
    } catch (err) {
      return {
        delivered: false,
        error: err instanceof Error ? err.message : "Could not post the question to GitHub.",
      };
    }
  }

  async closeThread(id: string): Promise<void> {
    this.mutate(id, (answer) => {
      answer.status = "closed";
    });
  }

  /**
   * Pull any author replies for one open thread into the local record.
   *
   * There is no webhook locally, so this runs whenever the thread screen is
   * opened — the local equivalent of the cloud app's sync worker.
   */
  async syncThread(id: string): Promise<void> {
    const parsed = parseJudgementId(id);
    if (!parsed) return;
    const record = this.read(parsed.recordId);
    if (!record) return;

    const answer = record.state?.answers[parsed.ordinal];
    if (!answer || answer.status !== "awaiting_reply" || answer.githubCommentId === null) return;

    const comments = await this.github().listReviewComments(refOf(record));
    const replies = comments.filter(
      (c) => c.in_reply_to_id === answer.githubCommentId || c.id === answer.githubCommentId,
    );

    this.mutate(id, (_a, rec) => {
      const messages = (rec.state!.messages[parsed.ordinal] ??= []);
      const seen = new Set(messages.map((m) => m.githubCommentId).filter(Boolean));
      for (const c of replies) {
        if (c.id === answer.githubCommentId || seen.has(c.id)) continue;
        messages.push({
          id: `${id}:${messages.length}`,
          role: "author",
          authorLogin: c.user?.login ?? null,
          body: c.body,
          githubCommentId: c.id,
          createdAt: c.created_at ?? new Date().toISOString(),
        });
      }
    });
  }

  async postReview(reviewId: string): Promise<PostResult> {
    const record = this.read(reviewId);
    if (!record) throw new Error("Review not found.");
    if (record.postedUrl) return { error: "This review has already been posted." };

    const judgements = toJudgementViews(record).filter((j) => j.status !== "withdrawn");
    const unanswered = judgements.filter((j) => j.bucket === null);
    if (unanswered.length) {
      return { error: `${unanswered.length} judgement(s) still unanswered.` };
    }

    const blocking = isBlocking(judgements);
    const event = blocking ? ("REQUEST_CHANGES" as const) : ("APPROVE" as const);

    try {
      const github = this.github();
      const ref = refOf(record);
      const pr = await github.getPR(ref);
      const result = await github.postReview(
        ref,
        pr.headSha,
        renderVerdict(judgements, blocking),
        event,
        [],
      );

      record.postedUrl = result.html_url;
      record.postedAt = new Date().toISOString();
      record.posted = true;
      this.write(record);

      return { url: result.html_url };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Could not post the review." };
    }
  }
}

// ---- record → view ----

function refOf(record: ReviewRecord): PRRef {
  return { owner: record.pr.owner, repo: record.pr.repo, number: record.pr.number };
}

function toReviewView(record: StoredRecord): ReviewView {
  return {
    id: record.id,
    owner: record.pr.owner,
    repo: record.pr.repo,
    number: record.pr.number,
    title: record.pr.title,
    postedAt: record.postedAt ?? null,
    postedUrl: record.postedUrl ?? null,
  };
}

function toJudgementViews(record: StoredRecord): JudgementView[] {
  return record.result.judgements.map((judgement, ordinal) => {
    const answer = record.state?.answers[ordinal] ?? EMPTY_ANSWER;
    return {
      ...judgement,
      id: judgementId(record.id, ordinal),
      reviewId: record.id,
      ordinal,
      bucket: answer.bucket,
      optionLabel: answer.optionLabel,
      note: answer.note,
      blocking: answer.blocking,
      status: answer.status,
      githubCommentId: answer.githubCommentId,
    };
  });
}

/**
 * Tolerate records written by older versions.
 *
 * The `meta` → `pr` rename and the missing id/createdAt/posted fields predate
 * the answer state, so a file from an earlier CLI still opens rather than
 * failing to parse.
 */
function migrate(raw: unknown, fallbackId: string): StoredRecord {
  const record = raw as StoredRecord & { meta?: ReviewRecord["pr"] };
  if (!record.pr && record.meta) {
    record.pr = record.meta;
    delete record.meta;
  }
  record.id ??= fallbackId;
  record.createdAt ??= new Date().toISOString();
  record.posted ??= false;
  record.state ??= { answers: {}, messages: {} };
  record.state.answers ??= {};
  record.state.messages ??= {};
  return record;
}
