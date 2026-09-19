# One voice for everything Komodo writes to a person

Status: Proposed
Date: 2026-09-05

## Decision

Every sentence Komodo generates for a human to read is written in one house
voice, defined once in a single markdown asset, and reachable from every place
that produces such text: the review prompt, the re-read prompt, the rendered
GitHub comments, the CLI `prompt` command, and the Claude Code plugin skill.

The voice is derived from how two principal engineers on the team actually
review pull requests. It is a writing style, not an impersonation. Comments
stay signed as Komodo. What changes is that they read like a colleague typed
them in the review box, not like a model filled in a template.

Text written for a machine is exempt: `fixPrompt`, `suggestion`, diagram specs
and JSON shapes keep their current instructions.

## Why

On 2026-08-21 a reviewer read an AI-drafted reply on one of our pull requests
and asked, before anything else, whether a person had written it. Their words:
it "reads like Claude", and it was "clearly different from how you would have
written it". The reply itself was correct. It still cost trust, because the
reader spent the first moment classifying the author instead of reading the
point.

Komodo has the same exposure, everywhere it writes. The review prompt already
asks for "plain language" and gives two examples of the voice, but the
examples are polished prose with em-dashes and triads, which is exactly the
register that got flagged. The rendered comments in `render/markdown.ts` were
written separately and have their own register. The re-read note asks for
"Komodo's voice" without saying what that is. Three surfaces, three voices,
none of them the team's.

An engineer who does not want to read AI-generated code will not read
AI-generated prose either, unless it is indistinguishable from what a peer
would have sent. The bar is that specific.

## What the source material says

Corpus: 25 recently reviewed pull requests per reviewer across
`underwriting`, `third_party_integrations`, `banking` and `ml_data_provider`,
every inline comment and review body they left, plus their messages in
`#underwriting-code-review` and related channels. Paraphrased below, not
quoted; the originals live in private repositories and this document does
not.

Reviewer A (relaxed register):

- Opens with a question when unsure, a statement when sure. "shouldn't we be
  calling X from here?" versus "since this is a stateless function I'd define
  it in the domain".
- Says out loud how much weight the comment carries: "pretty much just
  nitpicking", "fyi i think it's fine but", "i'm not really worried about
  this", "otherwise looks good".
- Gives the consequence in the same breath as the observation: a unique
  constraint on a column that may not be unique "could cause problems down
  the road for no reason".
- Offers the alternative concretely, by name: the function signature, the
  package, the endpoint to add first.
- Hands off by name when it is someone else's call, and says why it is theirs.
- Admits misreads and updates: "I just looked at your latest commits and
  realized why we didn't need to log that. oh well!"
- Approves in one line, with the residual worry attached as a question.
- Lowercase openers, contractions, "idk", "fyi", "haha". No headers, no bold,
  bullets only when listing files.

Reviewer B (terse register):

- One thought per comment, usually one sentence. "This should be an
  activity." "this should be enum." "Need to put this inside the release
  block."
- Rule, then one-line reason: "We don't want to call any logic from a
  workflow. Everything should be from an activity."
- Asks why when the need is not obvious: "why do we need this?", "any reason
  why we would need this?", "Do we need `== false`? or can just do `if flag`".
- Numbered list when there are three points, prose otherwise.
- Consequence stated flat when there is one: "This will still not work
  because created_at could be after the boundary date but still funded first."
- Links to the concrete line in the codebase that already does it right.
- Flags scope honestly: "Not related to this specifically but…"
- Approves with "LGTM but added one comment" or "good enough for now".
- Capitalised sentences, no slang, no formatting at all.

What they share is the voice. Where they differ (slang, capitalisation) is
personality, and Komodo does not need either.

## The asset

`VOICE_STYLE.md` at the repository root. Markdown so it can be read by a
person, pasted into a prompt, loaded by a skill, and diffed in review. This is
the proposed first version; it is the thing step 1 of the delivery plan ships.

```markdown
# How Komodo writes to a person

Write like a senior engineer leaving a review comment for a peer. They are
busy, they know the codebase, and they will stop reading the moment it sounds
generated.

## Shape

- One idea per comment. One or two sentences is the norm. Three is the limit
  before you should be asking whether it is two comments.
- A question when you are not sure, a statement when you are. Never
  "consider", never "it might be worth", never "you may want to".
- Say how much it matters, in words: "nitpick", "fyi", "not worried about
  this, but", "this needs to change before merge". Never a severity label
  inside the prose.
- Observation and consequence in the same sentence: "X, so Y will happen."
  The reader should not have to ask "and?"
- The alternative is concrete: a function name, a file, a link to the place
  that already does it right. Not a category of fix.
- Approval is one line, and the residual worry is a question attached to it.
- If you got it wrong, say so in one sentence and move on.
- If it is someone else's call, name them and say why it is theirs.

## Register

- Plain sentences. Contractions are fine. Start a sentence with "so", "but",
  or "also" if that is how it would be said.
- No em-dashes. No semicolons. No colons introducing a clause.
- No headers, no bold, no italics, no emoji in the body. Backticks only around
  identifiers and paths.
- A numbered list only when there are three or more parallel points. Never a
  bulleted list of one.
- No sentence that exists to justify a previous sentence with an adjective:
  "vendor-neutral so the next one can reuse it", "deliberate", "carefully".
  If a decision needs a reason, the reason is a consequence.
- No triads. Two examples, or one.
- No summary of what was done. The reader can see the diff.
- Numbers only when they change what the reader does.

## Never

- "Done." followed by a paragraph.
- "Consider refactoring", "it is worth noting", "one deliberate deviation".
- Restating the reader's question before answering it.
- Claiming to have run, seen, or verified anything you did not.
- Softening a real problem into a suggestion, or dressing a nitpick as a
  problem.

## Two comments in this voice

> Are we sure nothing downstream reads this attribute? It's been on the
> serializer for a while, so I'd want to know what research was done before
> we drop it.

> This should be an activity, not inline in the workflow. Anything running
> here changes the workflow's history and will break in-flight runs when we
> release.

## The same two, the way not to write them

> **Risk · Behaviour** · Removing `attribute` from the serializer may break
> downstream consumers — a leaked dependency, an untested integration, a
> stale client — for as long as they rely on it. Consider auditing usage
> before merge.

> This logic has been placed directly in the workflow rather than in an
> activity — a deliberate simplification, but one that changes the workflow's
> deterministic history and will cause non-determinism errors for
> already-running executions.
```

## Where it applies

Every path that produces text a person reads, and how the voice reaches it:

| Surface | File | How the voice gets there |
|---|---|---|
| Judgement fields (`title`, `lede`, `detail`, `ask`, options, `sourceNote`), `summary`, walkthrough summaries, `verdict`, verification checks | `packages/core/src/providers/prompt.ts` | Prompt section built from the asset; the two current examples replaced with the ones above |
| Field-level guidance the model also reads | `packages/core/src/schema.ts` `.describe()` strings | Rewritten to match; "No jargon, no severity words" becomes a pointer to the voice rules |
| Re-read note after an author replies | `packages/core/src/providers/reread.ts` | Same section appended; "in Komodo's voice" becomes a real reference |
| Receipt, outcome, judgement comment, review body | `packages/core/src/render/markdown.ts` | Hand-written copy audited against the asset once; a lint test keeps it there |
| Labels shown next to judgements | `packages/core/src/schema.ts` `KIND_LABEL`, `FOCUS_LABEL` | Audit only |
| Prompt handed to a Claude Code session | `packages/cli/src/commands/prompt.ts` | Inherits from `buildReviewPrompt` with no change |
| Plugin skill | `plugin/skills/komodo-review/SKILL.md` | Points at `VOICE_STYLE.md` so a session reads the same rules the prompt carries |
| Your own PR babysitting skill, outside this repo | wherever it lives | Reads the same file; this is the share-ability requirement |

Not in scope: `fixPrompt` (read by an agent), `suggestion` (code), diagram
specs, and comments a person types into Komodo's reply box, which are theirs.

`apps/web`'s own hand-written UI copy (settings descriptions, empty states,
help text) is a separate case: the app renders what the model wrote and
generates nothing itself, so it was never part of *this* delivery plan or its
enforcement (no `voiceLint` wiring, no prompt section). But the same
register applies there by a one-time editorial pass, for the same reason —
see the app copy audit that did that pass for the file list.

## Design

### One module owns it

`packages/core/src/voice.ts`:

```ts
export const VOICE_STYLE: string;            // the asset, as a string
export function voiceSection(extra?: string): string;  // the prompt block
export function voiceLint(text: string): VoiceViolation[];
```

The asset is loaded from `VOICE_STYLE.md` at build time (a tiny script that
writes `voice-style.generated.ts`, the same pattern as any bundled text), so
the markdown file is the single source and the TypeScript never drifts from
it. `voiceSection` wraps it under `## How to write` and appends a team's
`extra` if one is configured. `voiceLint` is a handful of regexes for the
mechanical "never" rules: em-dash, semicolon, the banned phrases, a header or
bold marker inside a field, a bulleted list of one. It is a test aid, not a
gate on reviews.

### Configuration

`komodo.yaml` gets one optional field:

```yaml
voice:
  extra: |
    We call the Temporal side "workflows" and "activities", never "jobs".
```

Extra text only, appended after the house voice. Teams do not replace the
voice; they add vocabulary. This sits with `profile` and `path_instructions`
as a deployment fact read from the file every pass, so it is deliberately not
on the settings screen and therefore not in `packages/ingest/src/settings.ts`.
Rule 3 of `AGENTS.md` is satisfied by having no control, not by adding one.
If a team later wants it editable in the UI, it goes through the seam with a
textarea like `customInstructions`, in the same commit.

### Enforcement

- `packages/core/test/voice.test.ts`: `voiceLint` returns nothing for the two
  good examples in the asset and flags each of the two bad ones. Every string
  `renderReceipt`, `renderOutcome`, `renderJudgementComment` and
  `renderReviewBody` produce for the existing fixtures passes the lint.
- `packages/core/test/render.test.ts` already exercises the renderers; the
  lint assertion is added there rather than duplicating fixtures.
- The prompt tests assert that `buildReviewPrompt` and `buildRereadPrompt`
  contain the voice section and do not contain the old examples.
- No runtime rejection. A review that breaks a voice rule is still a review.
  The lint result is logged at `debug` by the pipeline so a drift is visible
  without costing anyone a review.

### Privacy

The style is derived from two colleagues' comments in private repositories.
The shipped asset contains paraphrases and invented examples only. Their names
and the corpus stay out of this repository, which is public. This document
refers to them as Reviewer A and B for that reason.

## Delivery plan

1. **Write the asset.** `VOICE_STYLE.md` at the root, content above, reviewed
   by the two engineers it is modelled on before anything reads it. That
   review is the only real test of whether it sounds like them.
2. **Add `voice.ts` and the build step.** Generated string, `voiceSection`,
   `voiceLint`, tests for the lint against the asset's own examples.
3. **Rewire the two prompts.** `buildReviewPrompt` drops its inline "How to
   write" list and the two examples in favour of `voiceSection(config.voice?.extra)`.
   `buildRereadPrompt` appends the same section. Schema `.describe()` strings
   are shortened to point at the rules instead of restating them.
4. **Audit the renderers.** Rewrite the copy in `render/markdown.ts` line by
   line against the asset. Add the lint assertion to `render.test.ts`.
5. **Config field.** `voice.extra` in `KomodoConfigSchema`, documented in the
   `komodo.yaml` comment block, threaded through `ReviewInput` where `config`
   already travels.
6. **Plugin skill.** One paragraph in `SKILL.md` telling the session to read
   `VOICE_STYLE.md` before writing the result, so a Claude Code review and a
   `komodo pr` review sound the same.
7. **Verify against real output.** Run `komodo pr` on two recent pull requests
   from the team's repositories with and without the change, put the two
   judgement sets side by side, and hand them to the two reviewers blind.
   The change ships when they cannot tell which is which, or prefer the new
   one. Steps 1 through 6 are done when `pnpm typecheck`, `pnpm lint`,
   `pnpm build` and `pnpm -r test` are clean.

## Alternatives considered

**A `voice` memory rule.** The knowledge base already carries team rules into
the prompt. But memory rules are scoped by repository and file glob and are
about the code under review; the voice is about Komodo, applies to every
review, and must also reach text the model never writes (the renderers). A
rule that has to be present on every deployment is a default, not a memory.

**A settings-screen textarea replacing the whole voice.** Lets a team throw
the house voice away. The point of deriving it from real reviewers is that it
is the floor; `extra` is enough for vocabulary.

**Rejecting reviews that fail the lint.** Turns a style rule into an outage.
A review with an em-dash is still worth reading.

**Leaving the voice in the prompt as prose, as today.** That is the current
state, and it produced three registers across three files. The asset exists
so there is one place to argue about.

## Open questions

- Whether the two reviewers are willing to read the asset and the blind
  comparison in step 7. Without that, this is a guess at their voice rather
  than their voice.
- Whether `voice.extra` should also be readable from a repository's
  `AGENTS.md`-style file the way memory `file` rules are. Not needed for the
  first version.
