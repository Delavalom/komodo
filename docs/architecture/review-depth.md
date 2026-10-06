# Review depth

A review can spend more when a pull request warrants it. There are three depths:

| Depth | Passes | What the extra passes do |
|---|---|---|
| Standard | 1 | Nothing extra. This is the review Komodo always ran. |
| Deep | 2 | A second look, handed everything already raised and asked only for what is missing. |
| Thorough | 5 | Architecture, scope and tests get a pass each, in parallel with the base pass. Then the second look. |

A credit is one pass that returned. An extra pass that fails is left out and
the run carries on, and the review page then says "4 of 5 passes". A run is
one row per pull request head, so re-running the same commit replaces the
earlier run, passes and cost included: Settings → Usage counts the credits the
store still holds, dated by when each run was last saved, not every run ever
made. A failed base pass fails the run, as it always did. At thorough depth the
run waits for the three focused passes to finish before it fails, because they
share a checkout the next review may replace. Deeper passes also get a larger
turn budget, so they can trace callers, configuration and tests outside the
diff.

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
3. **The default**, `depth.default`. No rule can go below it, so the rule
   editor only offers depths above the current default, and marks a rule the
   default has since caught up with as having no effect.

Depth does not change `auto_review.max_files`. A pull request over that limit
is still skipped, not reviewed at a deeper depth. The limit answers whether a
pull request can be reviewed at all, and depth answers how hard to look once
it can.

The decision and its reason (`requested by renata`, `31 files changed (rule: at
least 28)`, `deployment default`) are stored on the run.

komodo.yaml is read for depth only on a store's first boot. `komodo serve`
adopts the file's review settings once (`initializeSettings`), and after that
Settings → Review owns them. A deployment whose store existed before depth
shipped therefore starts at standard with no rules, and adding `depth:` to
komodo.yaml later does nothing. Set it on the settings screen instead. When the
file and the store disagree on the default or on any rule, `komodo serve`
prints a line saying so. The settings screen checks depth fields on the
server, so a rule it accepts is one the reviewer can satisfy.

`komodo-review pr` and `komodo-review eval` have no store, so they read
`depth:` from komodo.yaml on every run. The same file can therefore pick one
depth on a laptop and another on the deployment, where Settings → Review owns
it.

## How it flows

`resolveDepth` (packages/core/src/depth-rules.ts) → `runPasses`
(packages/core/src/passes.ts) → `mergeResults` (packages/core/src/merge.ts) →
`ReviewRecord.run` → `reviews.depth / depthReason / passes / costUsd`. A
requested depth rides on `ai_review_jobs.depth` from the button to the worker.

Merging is deterministic. Judgements with the same focus in the same file
within three lines are one concern. So are file-level or cross-cutting
judgements (no path, or line 0) with the same title. The more severe reading
stays, unless swapping would replace a judgement the final filter keeps with
one it drops. A pass is compared only against what stood before it (the base
and earlier passes), never against its own judgements, including one it has
just put in place of an earlier finding. So two distinct findings from one pass
that sit close together are both kept. When one pass repeats an earlier concern
more than once, the most severe reading stays. The second look's prompt states
these rules and lists each earlier judgement's severity, so the model knows
that repeating a concern only counts when it raises the severity. A focused
pass may only contribute judgements in its own focus. Verification checks are
deduped by title, and a duplicate that is required makes the surviving check
required. Only the base pass writes the summary, walkthrough and scores.

## Did it help?

Analytics → PR Reviews → *What deeper reviews found* shows, for each pull
request size and depth, the critical and major judgements a person **upheld**
(newest answer Blocks or Agreed) per run. A dash means no run at that depth
and size yet. It is derived from the answer ledger at read time, so a depth
that only adds noise does not score better. Only answers given after the run
was last saved count, so re-running the same head starts that run's outcome
from zero. The timeframe filter places a run by when it was last saved.

Only runs whose depth Komodo decided are counted, which is every run with a
recorded reason. Runs saved before depth existed and runs submitted from
someone's own agent have none, and are left out rather than counted as
Standard. In `komodo dev`, each seeded run is dated when its pull request last
moved, so the panel covers the same window as "Total Reviews".

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

The eval only measures AI preflight for now. `eval/playground.yaml` seeds
source-visible defects, so it shows whether a deeper review finds more of
those. It does not show whether the architecture, scope and test passes raise
the decisions a person needs, and no fixture yet has expectations for those
focuses.

## Not covered

Interactive claims (`komodo-review claim` / `submit`) and pushed records
(`komodo-review push`) are stored as one pass with no depth reason. Komodo
cannot observe how many passes a person's own agent made, and it does not
record a number it did not observe. The deployment ignores a sender's claimed
depth, passes and cost (apps/web/src/lib/data/submission.ts). Usage counts
these runs as one credit each, and the depth panel leaves them out, along with
runs saved before depth existed.

An interactive claim also ignores a requested depth. A job queued from the
depth menu as Thorough, then claimed by `komodo-review claim` instead of the
deployment's worker, gets whatever the person's agent does. The claim does not
carry the depth yet. Carrying it means the plugin running the extra passes
itself, which needs a plugin release.
