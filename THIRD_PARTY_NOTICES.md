# Third-party notices

Komodo is MIT licensed (see `LICENSE`). Parts of it were ported from, or follow
the design of, the software below. Each is used under its own licence.

## OpenCodeReview (alibaba/open-code-review)

- Source: <https://github.com/alibaba/open-code-review>, commit `dd1a7e12a3565f5f7396acb394d83ab18102e6ce`
- Licence: Apache License 2.0 — <https://www.apache.org/licenses/LICENSE-2.0>
- Copyright 2026 alibaba/open-code-review Contributors
- Used in: `packages/core/src/grouping.ts` (the eval-only `grouping` experiment)

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
