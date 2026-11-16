import type { Reviewer } from "./types.js";

export interface OcrReviewerOptions {
  model?: string;
  mode?: "delegate" | "managed";
  ocrCommand?: string;
}

/**
 * The OCR (Alibaba open-code-review) reviewer, loaded only when asked for.
 *
 * It lives in `./reviewers/ocr.ts`, which may not be in this build. The specifier is a
 * template so the bundler includes the module when the file exists and the
 * typechecker does not insist that it does; when it is absent the import
 * fails at run time and the caller gets this message instead of a stack.
 */
export async function loadOcrReviewer(opts: OcrReviewerOptions): Promise<Reviewer> {
  const name = "ocr";
  let mod: { createOcrReviewer?: (o: OcrReviewerOptions) => Reviewer };
  try {
    mod = await import(`./reviewers/${name}.ts`);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `The ocr reviewer is not part of this build (packages/core/src/aacr/reviewers/ocr.ts is missing): ${detail}`,
    );
  }
  if (typeof mod.createOcrReviewer !== "function") {
    throw new Error("packages/core/src/aacr/reviewers/ocr.ts does not export createOcrReviewer.");
  }
  return mod.createOcrReviewer(opts);
}
