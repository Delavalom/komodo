# Review depth

A review can spend more when a pull request warrants it. There are three depths:

| Depth | Passes | What the extra passes do |
|---|---|---|
| Standard | 1 | Nothing extra. This is the review Komodo always ran. |
| Deep | 2 | A second look, handed everything already raised and asked only for what is missing. |
| Thorough | 5 | Architecture, scope and tests get a pass each, in parallel with the base pass. Then the second look. |

A credit is one pass that returned. An extra pass that fails is left out and
the run carries on, and the review page then says "4 of 5 passes". A failed
base pass fails the run, as it always did. At thorough depth the run waits for
the three focused passes to finish before it fails, because they share a
checkout the next review may replace. Deeper passes also get a larger turn
budget, so they can trace callers, configuration and tests outside the diff.

Depth buys a better brief, not a verdict. The extra passes look for
architectural fit, scope and test adequacy, plus results a person must observe
(AGENTS.md rule 15). A thorough review with nothing to say is not evidence that
the change works, and no depth makes a pull request safe to merge.

## Who decides

1. **A person**, from the menu beside Review with AI, or `--depth` on
   `komodo-review pr`. This wins outright, in either direction.
2. **Rules**, under Settings → Review → Review Depth, or `depth.rules` in
   komodo.yaml. Each rule has exactly one condition: changed files, changed
   lines, a path glob, or a label. The deepest matching rule wins. Files and
   lines are counted after path filters, so a lockfile rewrite is not a reason
   to look harder. A path rule names files to look harder at and may not start
   with `!`; use `path_filters` to exclude files.
3. **The default**, `depth.default`. No rule can go below it.

The decision and its reason (`requested by renata`, `31 files changed (rule: at
least 28)`, `deployment default`) are stored on the run.

komodo.yaml is read for depth only on a store's first boot. `komodo serve`
adopts the file's review settings once (`initializeSettings`), and after that
Settings → Review owns them. A deployment whose store existed before depth
shipped therefore starts at standard with no rules, and adding `depth:` to
komodo.yaml later does nothing. Set it on the settings screen instead. When the
file and the store disagree, `komodo serve` prints a line saying so. The
settings screen checks depth fields on the server, so a rule it accepts is one
the reviewer can satisfy.

## How it flows

`resolveDepth` (packages/core/src/depth-rules.ts) → `runPasses`
(packages/core/src/passes.ts) → `mergeResults` (packages/core/src/merge.ts) →
`ReviewRecord.run` → `reviews.depth / depthReason / passes / costUsd`. A
requested depth rides on `ai_review_jobs.depth` from the button to the worker.

Merging is deterministic. Judgements with the same focus in the same file
within three lines are one concern. So are file-level or cross-cutting
judgements (no path, or line 0) with the same title. The more severe reading
stays, unless swapping would replace a judgement the final filter keeps with
one it drops. A pass is compared only against the base and earlier passes,
never against its own judgements, so two distinct findings from one pass that
sit close together are both kept. A focused pass may only contribute
judgements in its own focus. Verification checks are deduped by title, and a
duplicate that is required makes the surviving check required. Only the base
pass writes the summary, walkthrough and scores.

## Did it help?

Analytics → PR Reviews → *What deeper reviews found* shows, for each pull
request size and depth, the critical and major judgements a person **upheld**
(newest answer Blocks or Agreed) per run. A dash means no run at that depth
and size yet. It is derived from the answer ledger at read time, so a depth
that only adds noise does not score better. Only answers given after the run
was last saved count, so re-running the same head starts that run's outcome
from zero.

`komodo-review eval eval/playground.yaml` runs seeded pull requests at each
depth and prints two columns per run. `shown` is the known defects among the
judgements a person would see. `raised` also counts judgements dropped below
`min_severity` or that could not be anchored to a changed line, so a gap
between them is a defect the reviewer found and the queue hid. The command
spends real quota, never posts, and writes its records to a temp directory it
removes, so it never touches the queue. The file and its match patterns are
validated before the first run. A failed run is reported and the eval carries
on, with a non-zero exit code. Run it from a clone of the target repository to
give the passes a working tree; elsewhere they see the diff only.

## Not covered

Interactive claims (`komodo-review claim` / `submit`) and pushed records
(`komodo-review push`) are stored as one standard pass. Komodo cannot observe
how many passes a person's own agent made, and it does not record a number it
did not observe. The deployment ignores a sender's claimed depth, passes and
cost (apps/web/src/lib/data/submission.ts).
