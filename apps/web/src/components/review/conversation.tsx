"use client";

/**
 * What has already been said about this pull request.
 *
 * The review screens ask a person to make decisions about a change. Half of
 * that work is finding out whether the question has already been asked and
 * answered — and until now the answer to that lived in a GitHub tab, which
 * meant either opening one or asking the author something they had already
 * explained.
 *
 * Threads, not a flat list. An inline comment and its replies are one
 * conversation about one line, and flattening them by timestamp interleaves
 * three arguments into an unreadable transcript. Comments on the pull request
 * itself have no anchor and stay chronological, which is what they are.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, MessageSquare, RefreshCw } from "lucide-react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkGemoji from "remark-gemoji";

import { Avatar, Badge } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useNow } from "@/lib/data/provider";
import {
  useDismissWatchEvent,
  useMarkWatchEventSeen,
  usePostConversationComment,
  useRefreshConversation,
} from "@/lib/data/mutations";
import { useWatchEvents, type WatchEventRow } from "@/lib/data/queries";
import { cn, relativeTime } from "@/lib/utils";
import type { PullRequestComment } from "@/lib/types";

/** What a submitted review's state is worth saying in one word. */
const REVIEW_STATE: Record<string, { label: string; tone: string }> = {
  APPROVED: { label: "approved", tone: "text-[hsl(var(--success))]" },
  CHANGES_REQUESTED: { label: "requested changes", tone: "text-[hsl(var(--error))]" },
  COMMENTED: { label: "commented", tone: "text-muted-foreground" },
  DISMISSED: { label: "review dismissed", tone: "text-muted-foreground" },
};

/** One inline thread, or one standalone comment. */
interface Thread {
  key: string;
  /** Set for a thread anchored to the diff. */
  anchor: { path: string; line: number | null } | null;
  root: PullRequestComment;
  replies: PullRequestComment[];
}

export function ConversationView({
  prId,
  prUrl,
  comments,
  observedAt,
  error,
}: {
  prId: string;
  prUrl: string;
  comments: PullRequestComment[];
  /** When GitHub was last read, or null if it never has been. */
  observedAt: number | null;
  error: string | null;
}) {
  const now = useNow();
  const router = useRouter();
  const refresh = useRefreshConversation();
  const [refreshing, startRefresh] = React.useTransition();
  // What the last re-read said, which outranks whatever the server render
  // knew: the reader pressed a button and is owed the answer to that press.
  const [refreshError, setRefreshError] = React.useState<string | null>(null);
  const problem = refreshError ?? error;

  const threads = React.useMemo(() => buildThreads(comments), [comments]);
  const watchEventByCommentId = useWatchEventsByCommentId(prId);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[760px] px-6 py-8">
        <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-[17px]">Conversation</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {observedAt === null
                ? "This has not been read from GitHub yet."
                : `Read from GitHub ${relativeTime(observedAt, now)}.`}
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={refreshing}
            onClick={() =>
              startRefresh(async () => {
                setRefreshError(await refresh(prId));
                router.refresh();
              })
            }
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {refreshing ? "Reading…" : "Re-read"}
          </Button>
        </header>

        {problem ? (
          // A missing token and an empty discussion look identical on screen
          // unless the screen says which — and "no comments" on a pull request
          // with twelve of them is the kind of quiet wrongness that costs a
          // reader their trust in the whole page.
          <p className="mb-6 border border-[hsl(var(--error))]/40 bg-[hsl(var(--error))]/5 px-3 py-2 text-sm">
            Couldn&apos;t read GitHub, so this may be incomplete or empty.{" "}
            <span className="text-muted-foreground">{problem}</span>
          </p>
        ) : null}

        {threads.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {problem
              ? "Nothing has been cached for this pull request."
              : "Nobody has commented on this pull request."}{" "}
            <a
              href={prUrl}
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-foreground"
            >
              Open it on GitHub
            </a>
            .
          </p>
        ) : (
          <ol className="flex flex-col gap-6">
            {threads.map((thread) => (
              <li key={thread.key}>
                <ThreadBlock prId={prId} thread={thread} watchEvents={watchEventByCommentId} />
              </li>
            ))}
          </ol>
        )}

        <div className="mt-8 border-t border-border pt-6">
          <h2 className="label-mono mb-2 text-[10px] text-muted-foreground">
            Add a comment
          </h2>
          <ReplyBox prId={prId} inReplyToId={null} placeholder="Say something on the pull request" />
        </div>
      </div>
    </div>
  );
}

function ThreadBlock({
  prId,
  thread,
  watchEvents,
}: {
  prId: string;
  thread: Thread;
  watchEvents: Map<string, WatchEventRow>;
}) {
  const [replying, setReplying] = React.useState(false);

  return (
    <div className="border border-border">
      {thread.anchor ? (
        <div className="flex items-baseline gap-2 border-b border-border bg-muted-accent/40 px-3 py-1.5">
          <span className="label-mono text-[10px] text-muted-foreground">
            {thread.anchor.path}
            {thread.anchor.line !== null ? `:${thread.anchor.line}` : ""}
          </span>
          {thread.replies.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              {thread.replies.length + 1} messages
            </span>
          ) : null}
        </div>
      ) : null}

      <CommentBody comment={thread.root} watchEvent={watchEvents.get(thread.root.id)} />
      {thread.replies.map((reply) => (
        <div key={reply.id} className="border-t border-border pl-6">
          <CommentBody comment={reply} watchEvent={watchEvents.get(reply.id)} />
        </div>
      ))}

      {/* Only an inline thread can be replied to in place: GitHub's reply
          endpoint is keyed on a review comment, and a reply to a plain
          conversation comment is just another conversation comment. */}
      {thread.anchor ? (
        <div className="border-t border-border px-3 py-2">
          {replying ? (
            <ReplyBox
              prId={prId}
              inReplyToId={thread.root.externalId}
              placeholder={`Reply to ${thread.root.author}`}
              onDone={() => setReplying(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setReplying(true)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground underline hover:text-foreground"
            >
              <MessageSquare className="h-3 w-3" />
              Reply in this thread
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

const MARKDOWN_PLUGINS = [remarkGfm, remarkGemoji];

/**
 * react-markdown turns markdown into React elements directly — it never
 * builds an HTML string or calls `dangerouslySetInnerHTML`, and by default it
 * drops raw HTML nodes embedded in the source rather than rendering them
 * (that's the `rehype-raw` plugin, which is deliberately not added here). So
 * a comment body stays arbitrary Markdown from a stranger, same as before,
 * but formatted the way GitHub itself would show it instead of as source.
 */
const MARKDOWN_COMPONENTS: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer nofollow"
      className="underline hover:text-foreground"
    >
      {children}
    </a>
  ),
  img: ({ src, alt }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={typeof src === "string" ? src : undefined}
      alt={alt ?? ""}
      loading="lazy"
      className="my-2 h-auto max-w-full rounded-sm"
    />
  ),
  code: ({ className, children }) =>
    /language-/.test(className ?? "") ? (
      <code className={cn("font-mono text-xs", className)}>{children}</code>
    ) : (
      <code className="rounded-sm bg-muted-accent px-1 py-0.5 font-mono text-[13px]">
        {children}
      </code>
    ),
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-sm border border-border bg-muted-accent/40 p-2">
      {children}
    </pre>
  ),
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => (
    <h1 className="mt-3 mb-1 text-base font-semibold first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-3 mb-1 text-[15px] font-semibold first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-3 mb-1 text-sm font-semibold first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-3 mb-1 text-sm font-semibold first:mt-0">{children}</h4>
  ),
  h5: ({ children }) => (
    <h5 className="mt-3 mb-1 text-sm font-semibold first:mt-0">{children}</h5>
  ),
  h6: ({ children }) => (
    <h6 className="mt-3 mb-1 text-sm font-semibold first:mt-0">{children}</h6>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-border pl-3 text-muted-foreground italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-border" />,
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse border border-border text-xs">
        {children}
      </table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border bg-muted-accent/40 px-2 py-1 text-left font-medium">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-border px-2 py-1 align-top">{children}</td>
  ),
};

function CommentBody({
  comment,
  watchEvent,
}: {
  comment: PullRequestComment;
  watchEvent?: WatchEventRow;
}) {
  const now = useNow();
  const state = comment.state ? REVIEW_STATE[comment.state] : undefined;

  return (
    <article className="px-3 py-2.5">
      <div className="flex flex-wrap items-baseline gap-2 text-xs">
        <Avatar seed={comment.author} label={comment.author} size={14} />
        <span className="text-foreground">{comment.author}</span>
        {state ? <span className={state.tone}>{state.label}</span> : null}
        {comment.kind === "review_summary" && !state ? (
          <Badge tone="muted">review</Badge>
        ) : null}
        <span className="text-muted-foreground">
          {relativeTime(comment.createdAt, now)}
        </span>
        <a
          href={comment.url}
          target="_blank"
          rel="noreferrer"
          className="ml-auto text-muted-foreground underline hover:text-foreground"
        >
          on GitHub
        </a>
      </div>
      {/* `[overflow-wrap:anywhere]`: a stack trace, a base64 blob or a long
          URL in a comment body is routine, and an unbroken token gives the
          pane thousands of pixels of horizontal scroll — which slides the
          header, the re-read button and the reply box off screen. */}
      <div className="mt-1.5 [overflow-wrap:anywhere] text-sm leading-relaxed">
        <Markdown remarkPlugins={MARKDOWN_PLUGINS} components={MARKDOWN_COMPONENTS}>
          {comment.body}
        </Markdown>
      </div>
      {watchEvent ? <WatchAnnotation event={watchEvent} /> : null}
    </article>
  );
}

/**
 * What Komodo made of a comment on a pull request being watched — the
 * verdict a person asked for, plus a draft reply they can copy into the box
 * below and edit. It never posts on its own; see AGENTS.md rule 15.
 */
function WatchAnnotation({ event }: { event: WatchEventRow }) {
  const now = useNow();
  const markSeen = useMarkWatchEventSeen();
  const dismiss = useDismissWatchEvent();

  return (
    <div className="mt-2 border-l-2 border-[hsl(var(--komodo-brand-green))] bg-muted-accent/30 py-1.5 pl-3 pr-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Eye className="size-3 text-muted-foreground" />
        <span className="text-muted-foreground">Komodo watch</span>
        <span
          className={
            event.verdict === "worth_addressing"
              ? "text-[hsl(var(--accent))]"
              : "text-muted-foreground"
          }
        >
          {event.verdict === "worth_addressing" ? "Worth addressing" : "Not worth addressing"}
        </span>
        <span className="text-muted-foreground">{relativeTime(event.createdAt, now)}</span>
        <div className="ml-auto flex items-center gap-2">
          {event.seenAt === null ? (
            <button
              type="button"
              onClick={() => markSeen(event.id)}
              className="text-muted-foreground underline hover:text-foreground"
            >
              Mark seen
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => dismiss(event.id)}
            className="text-muted-foreground underline hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      </div>
      <p className="mt-1 text-muted-foreground">{event.reasoning}</p>
      {event.draftResponse ? (
        <p className="mt-1.5">
          <span className="text-muted-foreground">Draft reply: </span>
          {event.draftResponse}
        </p>
      ) : null}
      {event.draftPatchSummary ? (
        <p className="mt-1.5">
          <span className="text-muted-foreground">Suggested change: </span>
          {event.draftPatchSummary}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The most recent, undismissed watch event for each comment on this pull
 * request, keyed the same way `buildThreads` keys a comment: `kind` and
 * `externalId` together, never `externalId` alone — GitHub numbers issue
 * comments, review comments and reviews from three separate counters, so a
 * bare id collides across kinds. A comment can pick up more than one triage
 * attempt (a retry after a failure); the newest one is what is worth reading.
 */
function useWatchEventsByCommentId(prId: string): Map<string, WatchEventRow> {
  const events = useWatchEvents();
  return React.useMemo(() => {
    const map = new Map<string, WatchEventRow>();
    for (const event of events) {
      if (event.prId !== prId || event.dismissedAt !== null) continue;
      const key = `${event.prId}:${event.commentKind}:${event.commentExternalId}`;
      const existing = map.get(key);
      if (!existing || event.createdAt > existing.createdAt) map.set(key, event);
    }
    return map;
  }, [events, prId]);
}

function ReplyBox({
  prId,
  inReplyToId,
  placeholder,
  onDone,
}: {
  prId: string;
  inReplyToId: number | null;
  placeholder: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const post = usePostConversationComment();
  const [body, setBody] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const send = async () => {
    if (pending || !body.trim()) return;
    setPending(true);
    setError(null);
    try {
      // The action returns its failure rather than throwing it: a thrown
      // server action error is redacted to "Minified React error #441" in a
      // production build, which is what `komodo dev` serves.
      const failure = await post({ prId, body, inReplyToId });
      if (failure) {
        setError(failure);
        return;
      }
      setBody("");
      onDone?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <div>
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={placeholder}
        rows={3}
      />
      <div className="mt-2 flex items-center gap-3">
        <Button size="sm" onClick={() => void send()} disabled={pending || !body.trim()}>
          {pending ? "Posting…" : "Comment on GitHub"}
        </Button>
        {onDone ? (
          <button
            type="button"
            onClick={onDone}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            Cancel
          </button>
        ) : null}
        <span className={cn("text-xs text-muted-foreground")}>
          This posts to the pull request.
        </span>
      </div>
      {error ? (
        <p className="mt-2 text-sm text-[hsl(var(--destructive))]">{error}</p>
      ) : null}
    </div>
  );
}

/**
 * Group the flat comment list into threads.
 *
 * Replies find their root through `inReplyToId`, which GitHub sets on every
 * reply to an inline comment — but only ever to the *first* comment in the
 * thread, so a reply to a reply still points at the root. A reply whose root is
 * missing from this fetch stands alone rather than being dropped: a comment
 * nobody can see is worse than one shown out of place.
 *
 * Keyed on the store's own id rather than on `externalId`. The three GitHub
 * endpoints number their comments independently — an issue comment and a review
 * can both be number 1 and have nothing to do with each other — so a map keyed
 * on the number alone silently drops one of them and renders the other twice.
 * `id` is `prId:kind:externalId` and was derived for exactly this reason.
 */
/**
 * GitHub App bots — Snyk, Optibot, Dependabot and the rest — always carry
 * this suffix on their login (`agent-optibot[bot]`, `dependabot[bot]`), the
 * same signal `packages/store/src/settings.ts` already filters on elsewhere.
 */
function isBotAuthor(author: string): boolean {
  return author.endsWith("[bot]");
}

function buildThreads(comments: PullRequestComment[]): Thread[] {
  // Only inline comments can be replied to, and only an inline comment can be
  // a reply's root — so the lookup is scoped to them. An issue comment that
  // happens to share a number with one is not its parent.
  const inlineByExternalId = new Map(
    comments.filter((c) => c.kind === "review").map((c) => [c.externalId, c]),
  );
  const threads = new Map<string, Thread>();
  const order: string[] = [];

  for (const comment of comments) {
    const root =
      comment.inReplyToId !== null && comment.kind === "review"
        ? inlineByExternalId.get(comment.inReplyToId)
        : undefined;

    if (root && root.id !== comment.id) {
      const existing = threads.get(root.id);
      if (existing) {
        existing.replies.push(comment);
        continue;
      }
    }

    threads.set(comment.id, {
      key: comment.id,
      anchor: comment.path !== null ? { path: comment.path, line: comment.line } : null,
      root: comment,
      replies: [],
    });
    order.push(comment.id);
  }

  // A person's thread first, a bot's after — a reader wants to see what was
  // said before deciding whether to read what was flagged. Array.prototype.sort
  // is stable, so within each group the reading order stays chronological.
  return order
    .map((key) => threads.get(key)!)
    .sort((a, b) => Number(isBotAuthor(a.root.author)) - Number(isBotAuthor(b.root.author)));
}
