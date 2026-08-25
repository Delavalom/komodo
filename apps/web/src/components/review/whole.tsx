"use client";

/**
 * The whole run, for when the queue is not what you want.
 *
 * Everything Komodo wrote about this head: the summary, the walkthrough, the
 * files it read, and the closing verdict built from the answers given so far.
 * The queue is the way through a review; this is the way around it.
 */
import { Badge } from "@/components/ui/display";
import { cn } from "@/lib/utils";
import type { Answer, ReviewDetail, ReviewFile } from "@/lib/types";

import { BUCKET_HEADING, BUCKET_ORDER, FOCUS_LABEL, SEVERITY_TONE } from "./labels";

export function WholeReview({
  detail,
  files,
}: {
  detail: ReviewDetail;
  files: ReviewFile[];
}) {
  const { review, judgements, answers } = detail;
  const answerFor = new Map<string, Answer>(
    answers.map((a) => [a.judgementId, a]),
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[820px] px-6 py-8">
        <Section title="Summary">
          <Bullets text={review.summary} />
        </Section>

        {review.walkthrough.length ? (
          <Section title="Walkthrough">
            <div className="border border-border">
              {review.walkthrough.map((entry, i) => (
                <div
                  key={entry.files.join("|")}
                  className={cn(
                    "grid grid-cols-[minmax(0,240px)_1fr] gap-4 px-3 py-2 text-sm",
                    i > 0 && "border-t border-border",
                  )}
                >
                  <div className="min-w-0 font-mono text-xs break-all text-muted-foreground">
                    {entry.files.join("\n")}
                  </div>
                  <div>{entry.summary}</div>
                </div>
              ))}
            </div>
          </Section>
        ) : null}

        <Section title="Decisions">
          {BUCKET_ORDER.map((bucket) => {
            const inBucket = judgements.filter(
              (j) => answerFor.get(j.id)?.bucket === bucket,
            );
            if (!inBucket.length) return null;
            return (
              <div key={bucket} className="mb-4">
                <div className="label-mono mb-1 text-[10px] text-muted-foreground">
                  {BUCKET_HEADING[bucket]}
                </div>
                <ul className="flex flex-col gap-1">
                  {inBucket.map((j) => {
                    const given = answerFor.get(j.id);
                    return (
                      <li key={j.id} className="text-sm">
                        {j.title.replace(/\.$/, "")} —{" "}
                        <span className="text-muted-foreground">
                          {given?.note ? given.note : given?.optionLabel}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
          {judgements.some((j) => !answerFor.get(j.id)?.bucket) ? (
            <p className="text-sm text-muted-foreground">
              {judgements.filter((j) => !answerFor.get(j.id)?.bucket).length}{" "}
              still unanswered.
            </p>
          ) : null}
        </Section>

        <Section title={`Judgements (${judgements.length})`}>
          <div className="border border-border">
            {judgements.map((j, i) => (
              <div
                key={j.id}
                className={cn(
                  "flex items-start gap-3 px-3 py-2 text-sm",
                  i > 0 && "border-t border-border",
                )}
              >
                <span
                  className={cn(
                    "label-mono w-14 shrink-0 pt-0.5 text-[10px]",
                    SEVERITY_TONE[j.severity],
                  )}
                >
                  {j.severity}
                </span>
                <div className="min-w-0 flex-1">
                  <div>{j.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {FOCUS_LABEL[j.focus]}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {j.path}:{j.line}
                  </div>
                </div>
                {j.postable ? null : (
                  <Badge tone="outline">Not on GitHub</Badge>
                )}
              </div>
            ))}
          </div>
        </Section>

        <Section title={`Files read (${files.length})`}>
          <div className="border border-border">
            {files.map((f, i) => (
              <details
                key={f.path}
                className={cn("text-sm", i > 0 && "border-t border-border")}
              >
                <summary className="flex cursor-pointer items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">
                    {f.path}
                  </span>
                  <span className="shrink-0 text-xs text-[hsl(var(--accent))]">
                    +{f.additions}
                  </span>
                  <span className="shrink-0 text-xs text-[hsl(var(--destructive))]">
                    −{f.deletions}
                  </span>
                </summary>
                <pre className="overflow-x-auto border-t border-border bg-muted-accent/40 px-3 py-2 font-mono text-xs">
                  {f.patch ?? "No patch was stored for this file."}
                </pre>
              </details>
            ))}
            {files.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                This run recorded no files.
              </div>
            ) : null}
          </div>
        </Section>

        {review.diagram ? (
          <Section title="Sequence diagram">
            <pre className="overflow-x-auto border border-border px-3 py-2 font-mono text-xs">
              {review.diagram}
            </pre>
            <p className="mt-2 text-xs text-muted-foreground">
              Mermaid source. Nothing renders it here yet.
            </p>
          </Section>
        ) : null}

        <p className="mt-8 text-xs text-muted-foreground">
          Run {review.id} · {review.provider}
          {review.model ? ` · ${review.model}` : ""} · head{" "}
          <span className="font-mono">{review.headSha.slice(0, 7)}</span>
        </p>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="label-mono mb-2 text-[10px] text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * The summary arrives as markdown bullets. Rendering the two things that
 * actually appear in it — list items and paragraphs — beats pulling in a
 * markdown parser for a field that is always a short list.
 */
function Bullets({ text }: { text: string }) {
  const lines = text.split("\n").filter((l) => l.trim());
  return (
    <div className="flex flex-col gap-1 text-sm">
      {lines.map((line, i) =>
        line.trimStart().startsWith("-") ? (
          <div key={i} className="flex gap-2">
            <span className="text-muted-foreground">·</span>
            <span>{line.trimStart().slice(1).trim()}</span>
          </div>
        ) : (
          <p key={i}>{line}</p>
        ),
      )}
    </div>
  );
}
