# Shared context sources

Status: Accepted
Date: 2026-09-05

## Decision

`context.sources` in `komodo.yaml` points at one or more folders on disk —
typically a checkout of an org-wide review-rules repository — whose markdown
files are read fresh on every review and handed to the reviewer as their own
prompt section, alongside the diff, the memory rules, and `path_instructions`.

This is for guidance that applies across an organisation rather than to one
repository: how to review, how to gather context, how the AI should use
specific tools. It is declared in the file, not on a settings screen, and it
reaches every path that produces a review — the server-side reviewer, `komodo
pr`, and `komodo prompt` (which is what the Claude Code plugin skill runs) —
because none of those paths can be trusted to carry it any other way.

A file under a source may open with YAML frontmatter narrowing where it
applies:

```markdown
---
description: How we review Temporal workflows
repos: [org/service-a, org/service-b]
clusters: [payments]
globs: ["app/workflows/**"]
---
```

`repos`, `clusters`, and `globs` are all optional and all narrowing, not a
required choice between them. A source itself can carry the same three
fields, narrowing every file inside it before any file's own scope is
considered.

`komodo context` inspects what a configuration resolves to, with or without a
repository to test scope against. **Custom context → Cross-repo context**
shows the same information, read-only, from what the reviewer last recorded.

## Why

Memory rules (`packages/ingest/src/memory.ts`) already let a team point at
files inside the repository under review — `CLAUDE.md`, `AGENTS.md`, and
similar. They do not solve a different, common shape of problem: guidance that
belongs to no single repository, written once by a platform or security team
and meant to apply everywhere. Before this, the only way to get that guidance
into a review was to paste it into every repository's `komodo.yaml`
`instructions` field, which drifts the moment one copy is edited and not the
others — the same drift `voice-style.md` (`docs/architecture/voice-style.md`)
solved for tone, applied here to substance.

The second problem memory rules have is narrower reach than it looks. They are
selected in `packages/ingest/src/review.ts`'s `gatherMemories`, which needs a
store — so they reach the server-side reviewer and nothing else. `komodo pr`
and `komodo prompt` (and therefore the plugin skill, `plugin/skills/komodo-
review/SKILL.md`) run without a store and see none of a team's memory rules.
A Claude Code session reviewing a branch by hand got materially less context
than the same pull request reviewed by `komodo serve` — an asymmetry nobody
chose and a real gap for a team whose actual review habit is a Claude Code
session, not the queue.

## Where it applies

| Surface | File | How |
|---|---|---|
| Server-side reviewer | `packages/ingest/src/review.ts` | `resolveContextSources` runs every review; cluster names come from the store |
| `komodo pr` | `packages/cli/src/commands/pr.ts` | Same resolution; no store, so cluster-scoped documents are reported, not silently dropped |
| `komodo prompt` (the plugin skill) | `packages/cli/src/commands/prompt.ts` | Same as `komodo pr`; stdout stays exactly the prompt, diagnostics go to stderr |
| `komodo serve` / `komodo dev` boot | `packages/cli/src/commands/serve.ts` | Resolved once at boot so the UI has something before the first review, and again every review after |
| Prompt | `packages/core/src/providers/prompt.ts` | `## Shared context`, one `###` heading per document, distinct from the `## What this team has told Komodo` memory-rule section |
| Web UI | `apps/web/src/components/memory/shared-context-view.tsx` | Reads `context.sources` from `loadConfig()` and the last-resolved record from the store's meta table; never walks the filesystem itself |
| Inspection | `packages/cli/src/commands/context.ts` (`komodo context`) | Prints what a configuration resolves to, optionally narrowed to one repository |

Re-reads (`packages/core/src/providers/reread.ts`) do not receive shared
context, the same as they do not receive memory rules today — see Open
questions.

## Configuration

```yaml
context:
  max_total_chars: 32000          # optional; cap across all shared docs per review
  sources:
    - type: path
      name: Company review rules  # optional; defaults to the folder's basename
      path: ../review-guidelines  # relative to this file; ~ is expanded
      repos: ["org/*"]            # optional source-level narrowing
      clusters: ["payments"]      # optional, by repo cluster name
      ignore: ["drafts/**"]       # optional, globs relative to the source
```

`type` is explicit rather than inferred from which keys are present. A
`github` variant — fetched by the server rather than read off a local
checkout, for the cloud case — is a sibling in the same discriminated union
and is not implemented yet.

There is deliberately no settings-screen control, for the same reason
`voice.extra` has none (`docs/architecture/voice-style.md`): a field that must
be present on every deployment is a default, not a preference, and rule 3 of
`AGENTS.md` is satisfied by having no control rather than by adding one that
would have to agree with the file forever.

`settings.memoryEnabled` does not gate this. That switch is about memory
rules — a database-backed, per-repository screen — and this is a deployment
fact declared alongside `voice.extra` and `path_instructions`. Coupling the
two would make turning off memory rules silently turn off an organisation's
tool-use guidance too, which is not what either control promises.

## Alternatives rejected

- **Store file bodies in the database.** A shared source is usually a git
  checkout someone else owns and pulls; a stored copy is a second version of
  it that drifts the moment the original moves and nobody notices.
- **A dedicated `context_sources` table.** Two drivers and a migration for
  rows nothing ever queries or joins — the resolved record is read whole, by
  one screen, and a `meta` key already does that for `lastDiscoveryError` and
  friends.
- **Reuse the `memories` prompt section for these documents.** Memory rules
  render as one bullet each; a shared context document can run to thousands
  of characters, and a bullet would either truncate it or crowd out the diff.
- **Read the filesystem directly from the web server.** True in `komodo dev`
  on one laptop, false the moment the web process and the reviewer are not
  the same machine — and even on one laptop, two independent readers of one
  folder are two versions of the same fact, which is the thing AGENTS.md rule
  4 exists to prevent.
- **Resolve sources inside `loadConfig`.** `loadConfig` is called by the web
  server on every request; it must stay a pure parse and must not walk a
  directory tree.

## Open questions

- Whether a re-read (`buildRereadPrompt`) should see shared context. It sees
  neither memory rules nor shared context today, and a follow-up question
  about a judgement may need the same tool-use rule that produced it.
- A `github` source type: fetch cadence, authentication, and whether it
  shares the checkout cache in `packages/ingest/src/checkout.ts`.
- A per-review usage ledger for shared context documents, the way
  `memory_rule_uses` exists for memory rules — useful for the same reason:
  telling a team which of its shared rules are actually read.
- Cluster resolution for `komodo pr`: it already opens a store at the end to
  save the review record and could read `listRepoClusters()` at the same
  point, which would close the one gap this design leaves on that path.
