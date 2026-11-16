import type { Judgement } from "../src/schema.js";

// Two hunks. New-side line numbers:
//   hunk 1: 1 import, 2 (blank), 3 export function limit(, 4   if (count > max) {, 5     return null;, 6   }, 7   return count;, 8 }
//   hunk 2: 20 function other(, 21   if (flag) {, 22     return null;, 23   }, 24 }
export const PATCH = [
  "@@ -1,5 +1,8 @@",
  ' import { x } from "./x";',
  " ",
  "+export function limit(count: number, max: number) {",
  "+  if (count > max) {",
  "+    return null;",
  "+  }",
  "+  return count;",
  "+}",
  "-const gone = 1;",
  "@@ -30,3 +20,5 @@",
  " function other(flag: boolean) {",
  "+  if (flag) {",
  "+    return null;",
  "+  }",
  " }",
].join("\n");

export const judgement = (over: Partial<Judgement> = {}): Judgement => ({
  path: "src/limit.ts",
  line: 4,
  severity: "major",
  kind: "Risk",
  focus: "code",
  tag: "changes how limits fail",
  title: "The limiter returns null instead of throwing.",
  lede: "Callers do not check.",
  detail: "Throwing is the alternative.",
  ask: "Should callers handle null?",
  sources: ["the diff"],
  sourceNote: "The diff.",
  code: "src/limit.ts:5 return null;",
  options: [
    { label: "Yes", bucket: "Blocks" },
    { label: "No", bucket: "Agreed" },
    { label: "Question", bucket: "Asked" },
    { label: "Not mine", bucket: "Passed on" },
  ],
  fixPrompt: "Throw.",
  ...over,
});

