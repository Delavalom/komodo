import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { CHIP_CLASS, REPLY_TINT } from "@/components/ui";
import { loadThread } from "@/lib/queue";
import { syncJudgementThread } from "@/lib/sync";
import { JudgeHeader } from "../../../judge-header";
import { ThreadActions } from "./thread-actions";

const ROLE_LABEL: Record<string, string> = {
  reviewer: "you",
  author: "the author",
  komodo: "Komodo",
};

const ROLE_VERB: Record<string, string> = {
  reviewer: "asked",
  author: "replied",
  komodo: "re-read the change",
};

function when(date: Date): string {
  return date.toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const { id } = await params;

  // On-demand sync: there is no background worker, so the thread catches up
  // whenever someone opens it. Failures here are silent by design.
  await syncJudgementThread(id, session.user.id, session.accessToken).catch(() => {});

  const thread = await loadThread(id, session.user.id);
  if (!thread) notFound();

  const { judgement, review, messages } = thread;
  const withdrawn = judgement.status === "withdrawn";
  const answered = messages.some((m) => m.role === "author");

  return (
    <>
      <JudgeHeader
        crumb={`#${review.number} · ${review.title}`}
        counter={withdrawn ? "withdrawn" : answered ? "answered" : "waiting"}
      />

      <div className="flex-1 w-full max-w-[720px] mx-auto px-6 pt-11 pb-14">
        <div className="flex items-center gap-2.5 mb-5">
          <span
            className={CHIP_CLASS}
            style={{
              color: REPLY_TINT.color,
              borderColor: REPLY_TINT.border,
              background: REPLY_TINT.bg,
            }}
          >
            Reply
          </span>
          <span className="font-mono text-[11px] text-text-faint">
            on this judgement · {judgement.path}:{judgement.line}
          </span>
        </div>

        <h2 className="font-serif font-normal text-[26px] leading-[1.4] text-text m-0 mb-6">
          {judgement.title}
        </h2>

        <div className="flex flex-col gap-4 pl-4 border-l-2 border-border mb-6">
          {messages.map((m) => (
            <div key={m.id}>
              <div className="flex items-baseline gap-2 mb-1.5">
                <span
                  className={
                    m.role === "komodo"
                      ? "font-mono text-[11px] tracking-[0.08em] uppercase text-accent"
                      : "text-[13px] font-semibold text-text"
                  }
                >
                  {m.role === "author" ? (m.authorLogin ?? ROLE_LABEL.author) : ROLE_LABEL[m.role]}
                </span>
                <span className="text-[11px] text-text-faint">
                  {ROLE_VERB[m.role]} · {when(new Date(m.createdAt))}
                </span>
              </div>
              <p className="text-[13px] leading-[1.75] text-text-muted m-0 whitespace-pre-wrap">
                {m.body}
              </p>
            </div>
          ))}

          {!answered && (
            <p className="text-[13px] leading-[1.75] text-text-faint m-0">
              Nothing back yet. This page checks GitHub each time you open it.
            </p>
          )}
        </div>

        {judgement.githubCommentId === null && (
          <div className="mb-6 rounded-lg border border-major/30 bg-major/10 px-4 py-3 text-xs text-major">
            This question was never delivered to GitHub, so the author has not seen it.
          </div>
        )}

        <ThreadActions
          judgementId={judgement.id}
          reviewId={review.id}
          withdrawn={withdrawn}
          answered={answered}
        />
      </div>
    </>
  );
}
