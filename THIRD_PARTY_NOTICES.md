# Third-party notices

Komodo is MIT licensed (see `LICENSE`). Parts of it were ported from, or follow
the design of, the software below. Each is used under its own licence.

## OpenCodeReview (alibaba/open-code-review)

- Source: <https://github.com/alibaba/open-code-review>, commit `dd1a7e12a3565f5f7396acb394d83ab18102e6ce`
- Licence: Apache License 2.0 — <https://www.apache.org/licenses/LICENSE-2.0>
- Copyright 2026 alibaba/open-code-review Contributors
- Used in: the eval-only experiments below

### `grouping` experiment (`packages/core/src/grouping.ts`)

Ported from OpenCodeReview's Go sources, rewritten in TypeScript (changed):

| Komodo | OpenCodeReview |
| --- | --- |
| thresholds `minFiles = 4`, `smallChangeLines = 200`, `maxFilesPerBundle = 10`; the small-change-set rule in `bundleFiles` | `internal/config/template/task_template.json` (`GROUPING_MIN_FILES`, `GROUPING_BUNDLE_LINE_THRESHOLD`), `internal/config/template/template.go` (`GroupingPlan`), `internal/agent/grouping.go` (`maxFilesPerGroup`, `groupWithoutLLM`) |
| file and size caps in `splitToCaps` | `internal/agent/grouping.go` (`enforceMaxFilesPerGroup`, `enforceGroupTokenBudget`) |
| which relations bundle files together (`relationKey`) | the grouping prompt in `internal/config/template/prompts/grouping_task_system.md` |
| deterministic selection of what is reviewed | `internal/agent/selection.go` |
| one isolated sub-review per bundle under a concurrency limit, a failed bundle contained (`runGroupedPasses`) | `dispatchSubtasks` in `internal/agent/agent.go` |

Differences: OpenCodeReview asks a model to partition the files; Komodo
recognises the same relations from paths, with no model call. OpenCodeReview
never dispatches deleted files; Komodo does.

### `pin` experiment

Used in: `packages/core/src/pin.ts` (the eval-only `pin` experiment).

| Komodo file | Derived from | What was taken |
| --- | --- | --- |
| `packages/core/src/pin.ts` | `internal/diff/resolver.go` (`ResolveComment`, `resolveFromHunk`, `extractSideLines`, `matchConsecutive`, `splitAndNormalize`, `normalizeLine`) and `internal/diff/relocation.go` | The idea of placing a review comment by matching a quoted code snippet against the diff's new-side lines instead of trusting the model's line number; the line normalisation (trim, strip a leading `+`/`-`); consecutive-line matching that skips blank lines. Rewritten in TypeScript, with additional match tiers and a nearest-line tie-break that OCR does not have. |

### `reflect` experiment (`packages/core/src/reflect.ts`)

Ported into `packages/core/src/reflect.ts` (the `reflect` experiment) from:

- `internal/agent/agent.go`: `executeGroupReviewFilter`,
  `buildGroupFilterCommentsJSON`, `parseFilterToolCalls` and the `filterTools`
  definitions. This is the structure of a separate pass that checks finished
  comments against the diff, and the rule that the model reasons before it
  names what to remove.
- `internal/config/template/prompts/review_filter_task_system.md` and
  `review_filter_task_user.md`: the prompt. That is the lopsided cost argument,
  the two grounds for removal, the protected subjects that are never removed,
  and the order of the method.

The port is rewritten for Komodo's judgements, adds a `revise` verdict and read
access to a checkout, and takes its voice from `VOICE_STYLE.md`. It is not a
copy of OpenCodeReview's code: the files above are Go and Markdown, and what
carries over is the logic and the structure of the prompt.

Changes from the original are stated in the header of each derived file, as
Apache-2.0 section 4(b) asks. This is the notice section 4(d) refers to; the
upstream project ships no separate `NOTICE` file.

Licensed under the Apache License, Version 2.0; you may obtain a copy at
http://www.apache.org/licenses/LICENSE-2.0. Unless required by applicable law
or agreed to in writing, software distributed under the License is distributed
on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
express or implied.
