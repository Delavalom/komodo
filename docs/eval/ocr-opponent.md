# OpenCodeReview as an opponent reviewer

`packages/core/src/aacr/reviewers/ocr.ts` exports `createOcrReviewer`, so an
AACR run can put [OpenCodeReview](https://github.com/alibaba/open-code-review)
(`ocr`, Go, Apache-2.0) next to Komodo on the same instances, with the same
model, and get comments back in the shared `GeneratedComment` shape.

```ts
createOcrReviewer({ mode: "delegate" }); // name "ocr"          – the default
createOcrReviewer({ mode: "managed" });  // name "ocr-managed"
```

Options: `model`, `mode`, `ocrCommand` (path to `ocr`), plus `claudeCommand`,
`timeoutMs`, `maxBudgetUsd` (delegate), `maxTokensBudget` and `keyFile`
(managed). `review(instance, repoPath)` reviews `baseCommit..headCommit` with
merge-base semantics (`--from/--to`), reads the checkout without modifying
it, and returns failures on the run (`error`, empty `comments`) rather than
throwing, so one bad instance does not end a benchmark.

## Install

`mise use -g npm:@alibaba-group/open-code-review` (ocr 1.13.10). Verify with
`ocr version`. Pass `ocrCommand` when `ocr` is not on `PATH`.

## The two modes

### `delegate` (default)

OCR's own delegation mode, the one its docs describe for host agents. OCR does
no LLM work: `ocr delegate preview` picks the reviewable files and
`ocr delegate rule` resolves the review rules. The host agent does the review.

The reviewer runs `claude -p` in the checkout with:

- **Model**: `claude-sonnet-5-5`, which is Komodo's `ClaudeProvider` default
  (same login, the user's Claude subscription; no API key).
- **The OCR skill**: OCR's `open-code-review-delegate` skill, command and
  `plugin.json`, vendored unmodified in `ocr-delegate-plugin.ts` (Apache-2.0,
  commit `dd1a7e1`) and written into a throwaway directory passed as
  `--plugin-dir`. Nothing is installed into `~/.claude`.
- **Isolation**: `--strict-mcp-config` and `--setting-sources project`. The
  user's MCP servers, hooks and rule files do not reach the run (checked: a
  Haiku probe with these flags cannot see the user-level rules).
- **Tools**: `Bash(ocr:*)`, `Bash(git:*)`, `Read`, `Grep`, `Glob`; `Edit` and
  `Write` denied; `dontAsk` permission mode; `--max-budget-usd` guard.
- **Output**: `--json-schema` gives `structured_output` with
  `{comments:[{path, content, start_line, end_line, category, severity}]}`.
  Tokens and `total_cost_usd` come from claude's JSON. Input tokens are
  uncached + cache-read + cache-creation (AACR's Claude convention). The cost
  is the API list-price equivalent; on a subscription nothing is billed.

### `managed`

Plain `ocr review --from --to --format json --audience agent --concurrency 8
--max-tools 50` (ocr clamps `--max-tools` below 50 to 50, so the 30 in AACR's
adapter is really 50). This is OCR as shipped: its own per-file multi-agent
loop, tools, prompts, rules and LLM post-filter.

- **Model**: `anthropic/claude-sonnet-5.5` on OpenRouter, through OCR's
  OpenAI-compatible protocol (`OCR_LLM_URL=https://openrouter.ai/api/v1`,
  `OCR_LLM_PROTOCOL=openai`).
- **Key**: `OPENROUTER_API_KEY`, else `~/.config/edit-studio/openrouter.key`.
  It is handed to the child process through its environment and nowhere else,
  and is redacted from any error text.
- **Isolation**: the child gets a throwaway `HOME`, because a
  `~/.opencodereview/config.json` outranks the environment variables and
  global OCR rules would change the run.
- **Guard**: `--max-tokens-budget` (default 2M tokens, about $4 at Sonnet 5.5
  prices; set it lower for a cheap pilot).
- **Output**: `comments[]` plus `summary.input_tokens/output_tokens`. OCR
  reports no price and OpenRouter is billed per token, so `costUsd` is `null`;
  compute it from the token counts and the model's current rate.

## Conversion

Both modes go through `convertOcrComments`, which mirrors AACR's own
`build_target_comments_from_ocr`: the body is `content` only (`suggestion_code`
and `existing_code` are not shown to the judge), an empty body is dropped, a
missing end of the range takes the other end, and a reversed range is put the
right way round. Side is always the new code.

## Is the comparison with Komodo like-for-like?

Model: yes in both modes, to the extent a routed model can be. Delegate is the
same model through the same Claude Code runtime Komodo uses. Managed is the
same Anthropic model through OpenRouter, so provider routing, caching and
default sampling are OCR's and OpenRouter's, not Komodo's.

Method: no, and that is the point of the comparison.

| | Komodo | OCR delegate | OCR managed |
|---|---|---|---|
| Model | claude-sonnet-5-5 | claude-sonnet-5-5 | anthropic/claude-sonnet-5.5 |
| Runtime | Agent SDK, Read/Glob/Grep | Claude Code, Bash(git, ocr)/Read/Grep/Glob | OCR's own tool loop |
| Review prompt | Komodo's | OCR skill + OCR rules | OCR's templates + rules |
| File selection | Komodo's filters | OCR (`delegate preview`) | OCR |
| Per-file concurrency, post-filter | n/a | none (one agent, sequential) | yes (concurrency 8, LLM filter) |
| Billing | subscription | subscription | OpenRouter credit |

## Which mode for a fair comparison

Run **delegate** as the controlled comparison and treat **managed** as the
"OCR as its authors ship it" number.

- Delegate holds the model and the agent runtime fixed, so the difference you
  measure is the review method: OCR's rules and file selection against
  Komodo's pipeline. It is free on the subscription and cheap to repeat. What
  it leaves out is OCR's concurrency and post-filter, so it can understate OCR.
- Managed is what AACR's published OCR results measure (`ocr review`), so a
  skeptic cannot say OCR was handicapped. Its costs are real money and a
  different transport.

If only one can be run, run managed for the headline claim and delegate for
the control; if the claim is "same model, different method", delegate is the
cleaner experiment. Do not merge the two result sets under one name. The
reviewer names differ (`ocr`, `ocr-managed`) so a run directory can hold both.

## Smoke test

One real instance, <https://github.com/Delavalom/komodo-playground> PR #1
(`4eb605c..f17a739`, three seeded defects: SQL injection, off-by-one, race).
Both modes ran through `createOcrReviewer`.

| | delegate | managed |
|---|---|---|
| Comments | 6 | 6 |
| Seeded defects found | SQL injection, `pageCount` floor, `lastItemIndexOnPage`, `credit` race, `transfer` race | same |
| Extra | sync→async `credit` note | same |
| Wall time | 35.6 s | 26.0 s |
| Input / output tokens | 225,951 / 2,068 (mostly cache reads) | 33,179 / 1,615 |
| Cost | $0.095 list-equivalent, $0 billed | about $0.08 at list rates (OpenRouter metered about $0.056 on an earlier identical run) |

One instance says the plumbing works and that neither mode misses easy,
seeded bugs. It says nothing about relative quality; that needs the AACR set.
The same delegate run cost $0.19 list-equivalent the first time (cold prompt
cache) and $0.095 the second, so that figure varies with cache state.

## Tests

`packages/core/test/aacr/ocr-reviewer.test.ts`: the converter and both output
parsers on trimmed real output (`test/fixtures/ocr/`), and the reviewer end to
end against stand-in `claude` and `ocr` scripts (arguments, throwaway plugin,
OpenRouter environment, isolated `HOME`, failure on the run, key redaction).
