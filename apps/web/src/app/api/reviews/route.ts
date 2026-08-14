import { NextRequest, NextResponse } from "next/server";
import os from "os";
import { auth } from "@/auth";
import { getDb, judgements, reviews } from "@/db";
import { getBalance, calculateCreditsCharged, deductCredits, MIN_REVIEW_BALANCE } from "@/lib/credits";
import { parsePRRef, GitHubClient, OpenRouterProvider, KomodoConfigSchema, runReview } from "@komodo/core";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.prUrl || !body?.model) {
    return NextResponse.json({ error: "prUrl and model are required" }, { status: 400 });
  }

  const { prUrl, model } = body as { prUrl: string; model: string };

  let ref: ReturnType<typeof parsePRRef>;
  try {
    ref = parsePRRef(prUrl);
  } catch {
    return NextResponse.json({ error: "Invalid PR URL. Use https://github.com/owner/repo/pull/N" }, { status: 400 });
  }

  const userId = session.user.id;
  const balance = await getBalance(userId);
  if (balance < MIN_REVIEW_BALANCE) {
    return NextResponse.json(
      { error: `Insufficient credits. You have ${balance} credits; minimum ${MIN_REVIEW_BALANCE} required.` },
      { status: 402 },
    );
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Service unavailable: missing API key" }, { status: 503 });
  }

  const provider = new OpenRouterProvider(apiKey, model);

  const config = KomodoConfigSchema.parse({
    provider: "openrouter",
    model,
    post: { request_changes: false },
  });

  const github = new GitHubClient(session.accessToken);

  try {
    // Komodo no longer posts on the reviewer's behalf: the human answers each
    // judgement and posts the result themselves from the close screen.
    const { record } = await runReview({
      ref,
      provider,
      config,
      github,
      post: false,
      outDir: os.tmpdir(),
    });

    const usage = provider.lastUsage;
    const costUsd = usage?.cost ?? 0;
    const creditsCharged = calculateCreditsCharged(costUsd);

    const db = getDb();
    const inserted = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(reviews)
        .values({
          userId,
          owner: ref.owner,
          repo: ref.repo,
          number: ref.number,
          title: record.pr.title,
          url: record.pr.url,
          provider: "openrouter",
          model,
          confidence: record.result.confidence,
          findingsCount: record.result.judgements.length,
          costUsd: String(costUsd),
          creditsCharged,
          record,
        })
        .returning({ id: reviews.id });

      // Materialize the judgements so the cross-PR queue can query them directly.
      if (record.result.judgements.length) {
        await tx.insert(judgements).values(
          record.result.judgements.map((j, ordinal) => ({
            reviewId: row.id,
            userId,
            ordinal,
            kind: j.kind,
            tag: j.tag,
            title: j.title,
            lede: j.lede,
            detail: j.detail,
            ask: j.ask,
            sources: j.sources,
            sourceNote: j.sourceNote,
            code: j.code,
            options: j.options,
            path: j.path,
            line: j.line,
            endLine: j.endLine ?? null,
            severity: j.severity,
            suggestion: j.suggestion ?? null,
            fixPrompt: j.fixPrompt,
          })),
        );
      }

      return row;
    });

    await deductCredits(userId, creditsCharged, `review:${ref.owner}/${ref.repo}#${ref.number}`, usage?.generationId ?? null);

    return NextResponse.json({ id: inserted.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Review failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
