# Third-party notices

Komodo is MIT-licensed (see `LICENSE`). Parts of it are derived from the
projects below, which carry their own licenses; each derived file names its
source in a header comment.

## OpenCodeReview (Alibaba)

- Project: https://github.com/alibaba/open-code-review
- License: Apache License 2.0 — https://www.apache.org/licenses/LICENSE-2.0
- Copyright 2026 alibaba/open-code-review Contributors

Used in:

| Komodo file | Derived from | What was taken |
| --- | --- | --- |
| `packages/core/src/pin.ts` | `internal/diff/resolver.go` (`ResolveComment`, `resolveFromHunk`, `extractSideLines`, `matchConsecutive`, `splitAndNormalize`, `normalizeLine`) and `internal/diff/relocation.go` | The idea of placing a review comment by matching a quoted code snippet against the diff's new-side lines instead of trusting the model's line number; the line normalisation (trim, strip a leading `+`/`-`); consecutive-line matching that skips blank lines. Rewritten in TypeScript, with additional match tiers and a nearest-line tie-break that OCR does not have. |

Changes from the original are stated in the header of each derived file, as
Apache-2.0 section 4(b) asks. This is the notice section 4(d) refers to; the
upstream project ships no separate `NOTICE` file.
