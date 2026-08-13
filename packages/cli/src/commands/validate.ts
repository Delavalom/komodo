import { readFileSync } from "node:fs";
import pc from "picocolors";
import { buildReviewRecord, ReviewResultSchema, saveReviewRecord, type DiffFile, type DiffMeta } from "@komodo/core";

interface RawRecord {
  meta?: DiffMeta;
  files?: DiffFile[];
  result?: unknown;
  provider?: string;
  model?: string;
}

export async function validateCommand(path: string): Promise<void> {
  let raw: RawRecord;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(pc.red(`File not found: ${path}`));
    } else if (err instanceof SyntaxError) {
      console.error(pc.red(`Invalid JSON in ${path}: ${err.message}`));
    } else {
      console.error(pc.red(`Error reading ${path}: ${err}`));
    }
    process.exit(1);
  }

  if (!raw.result) {
    console.error(pc.red("Missing 'result' field in JSON."));
    process.exit(1);
  }
  if (!raw.meta) {
    console.error(pc.red("Missing 'meta' field in JSON."));
    process.exit(1);
  }
  if (!raw.files) {
    console.error(pc.red("Missing 'files' field in JSON."));
    process.exit(1);
  }

  const parsed = ReviewResultSchema.safeParse(raw.result);
  if (!parsed.success) {
    console.error(pc.red("ReviewResult validation failed:"));
    for (const issue of parsed.error.issues) {
      console.error(pc.yellow(`  ${issue.path.join(".")}: ${issue.message}`));
    }
    process.exit(1);
  }

  const record = buildReviewRecord({
    meta: raw.meta,
    files: raw.files,
    result: parsed.data,
    provider: raw.provider ?? "skill",
    model: raw.model,
  });

  const recordPath = saveReviewRecord(record);
  console.log(recordPath);
}
