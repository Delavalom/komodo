import { z } from "zod";
import { annotatePatch } from "../diff.js";
import type { Judgement } from "../schema.js";

export const RereadResultSchema = z.object({
  stillApplies: z
    .boolean()
    .describe("False only if the code no longer does what the judgement claims it does"),
  note: z
    .string()
    .describe(
      "Two or three sentences in Komodo's voice, addressed to the reviewer. If the judgement no longer applies, say what changed and withdraw the claim explicitly.",
    ),
});

export type RereadResult = z.infer<typeof RereadResultSchema>;

export interface RereadInput {
  judgement: Judgement;
  /** What the reviewer asked the author. */
  question: string;
  /** What the author replied. */
  reply: string;
  /** Current patch for `judgement.path` at `headSha`, or undefined if the file is gone. */
  patch?: string;
  headSha: string;
}

/**
 * A provider that can answer a single follow-up question about one judgement.
 * Separate from `ReviewProvider` because it returns a verdict, not a review.
 */
export interface RereadProvider {
  readonly name: string;
  reread(input: RereadInput): Promise<RereadResult>;
}

export function rereadJsonSchema(): Record<string, unknown> {
  // Same draft-07 treatment as reviewResultJsonSchema — the Claude Code CLI's
  // validator rejects the draft/2020-12 meta-schema reference zod v4 emits.
  const schema = z.toJSONSchema(RereadResultSchema, { target: "draft-7" }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

export function buildRereadPrompt(input: RereadInput): string {
  const { judgement: j, question, reply, patch, headSha } = input;

  const code = patch
    ? `\`\`\`diff\n${annotatePatch(patch)}\n\`\`\``
    : "(this file is no longer part of the pull request)";

  return `You raised a judgement on a pull request. The reviewer asked the author a question about it, the author answered, and the code may have changed since. Read the code as it stands now and decide whether your judgement still holds.

## The judgement you raised
- Kind: ${j.kind}
- Title: ${j.title}
- What you said: ${j.lede}
- ${j.detail}
- You asked the reviewer: ${j.ask}
- Cited: ${j.path}:${j.line}

## The reviewer asked
${question}

## The author replied
${reply}

## ${j.path} as it stands now (head ${headSha.slice(0, 7)})
Each diff line is prefixed with its line number in the NEW version of the file.

${code}

## Your job
Decide one thing: does the code still do what your judgement claimed?

- Judge the CODE, not the reply. A promise to fix it later is not a fix. If the author says they changed something but the diff does not show it, the judgement still applies.
- If it still applies, say briefly why the reply does not resolve it.
- If it no longer applies, withdraw the claim in plain language: say what the code does now, and state that the original claim is withdrawn. Do not be defensive about having raised it.
- Address the reviewer, not the author. Two or three sentences.`;
}
