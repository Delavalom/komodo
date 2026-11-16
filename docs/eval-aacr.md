# AACR-Bench harness (`komodo-review eval aacr`)

Scores Komodo's AI preflight against [AACR-Bench](https://github.com/alibaba/aacr-bench)
(Apache-2.0) with the benchmark's own default metric, **file-level semantic
coverage**, so a Komodo number can sit next to a published one. It never posts
to GitHub and never touches the store.

```sh
komodo-review eval aacr --limit 20 --seed 42                 # review, judge, score
komodo-review eval aacr --limit 20 --stratify language       # one language at a time
komodo-review eval aacr --depth thorough --experiment pin    # eval-only switches
komodo-review eval aacr --limit 20 --preview                 # repos + diffs, no model calls
komodo-review eval aacr --limit 20 --resume                  # skip finished instances
komodo-review eval aacr score  .komodo/eval/aacr/v2/komodo/<run-id>
komodo-review eval aacr compare .komodo/eval/aacr/v2/komodo/<a> .komodo/eval/aacr/v2/komodo/<b>
komodo-review eval aacr --reviewer ocr --ocr-mode delegate   # needs packages/core/src/aacr/reviewers/ocr.ts
```

Every reviewed instance is a real model run, and so is every judge call that is
not already cached.

## What matches upstream exactly

Ported from `alibaba/aacr-bench@c99d126`, `evaluation/`:

| Upstream | Komodo |
| --- | --- |
| `converters/aacr_bench.py` — shuffle all records with `random.Random(seed)`, then `--limit`, then convert; base = `source_commit`, head = `target_commit`, id = `owner__name@head[:7]` | `aacr/dataset.ts`, with CPython's Mersenne Twister and `shuffle` in `aacr/python-compat.ts`. The same seed and limit pick the same pull requests. |
| `judge.py::match_llm_file_level` prompt and last-`[...]` JSON parse | `aacr/judge.ts`, character for character |
| `judge.py::evaluate_file_level_semantics` — group by normalised path, one judge call per generated comment against every reference on its file, greedy dedup in record order (`hit_new_gt`) | `aacr/metrics.ts` |
| `evaluate.py::_compute_summary` — micro-averaged precision/recall, F1 on the rounded rates, missing results out of every denominator, Python `round()` (half-even on exact ties) | `aacr/metrics.ts::summarize`, `pyRound` |
| `repo_utils.py` — partial clone (treeless → blobless → full), fetch base and head, merge-base, head checked out clean; HF snapshots for what GitHub no longer has | `aacr/repo.ts` |

`packages/core/test/aacr/differential.test.ts` scores a fixed fixture with both
the TS port and upstream's real `evaluate()` (run offline with a fake judge
client) and requires the same summary, the same audit records and the same
judge prompts. The Python output is committed as `official-golden.json`; set
`AACR_EVALUATOR=<aacr-bench>/evaluation` to run the Python side live (needs uv).

## Scoring a run with the official evaluator

Each run directory also holds `official/`: one result per instance in the shape
`evaluate.py` reads for an OCR-style reviewer, plus `official/dataset.jsonl`,
the selection in upstream's standard schema. Point upstream at it:

```python
instances = schema.load_instances(Path(run_dir) / "official" / "dataset.jsonl")
await evaluate.evaluate(instances, Path(run_dir) / "official", "komodo", out_dir)
```

## Where it differs, and why

- **Judge model and transport.** Upstream calls an OpenAI-compatible endpoint
  at temperature 0 with thinking off. Komodo asks Claude (default
  `claude-sonnet-5-5`) through the Agent SDK with no tools, one turn and no
  settings loaded; the SDK does not expose temperature. Published numbers used
  other judges, so a judge change alone moves scores. Plain text rather than
  structured output, because the prompt asks for per-reference reasoning
  followed by the array, and the judge exists to ask what upstream asks.
- **A failed judge call** is scored as no match, as upstream does, but it is
  retried twice first, counted in `metrics.json` (`komodo.judge_errors`), never
  cached, and re-asked by `eval aacr score`.
- **Repositories.** GitHub first, then the AACR-Bench snapshot on Hugging Face
  (pinned revision, verified against its `SHA256SUMS`) for commits GitHub no
  longer serves. Upstream prefers the snapshot. Clones are cached under
  `~/.cache/komodo/aacr` and each instance gets its own worktree, so two pull
  requests from one repository can be reviewed at once.
- **What Komodo is asked.** Komodo reviews `merge-base(base, head)...head` with
  its default configuration (not the komodo.yaml of the directory it runs in):
  path filters, depth, passes, merge and the `validateJudgements` filter, as a
  pull request gets them. Each kept judgement is one generated comment whose
  text is title, lede and detail. A change with nothing left after path filters
  is an empty review (zero comments), not a failure.
- **Tokens** count cache reads and writes as input, the accounting upstream
  uses for its Claude reviewer.

## Run directory

```
.komodo/eval/aacr/<version>/<reviewer>/<run-id>/
  run.json            selection and reviewer settings; --resume refuses a mismatch
  instances.json      the selected instances, references included
  results/<id>.json   finished reviews        errors/<id>.json  failed attempts, retried on --resume
  official/           upstream-shaped results + dataset.jsonl
  judge-cache/        judge answers by model and prompt
  metrics.json        { ex_info, summary, eval_res, komodo } — summary keys as upstream
  summary.md
```

`--experiment a,b` sets `RunReviewOptions.experiments`, carried to every
provider call as `ReviewInput.experiments`. It is an eval-only switch, not a
setting: nothing in komodo.yaml or the app reaches it.
