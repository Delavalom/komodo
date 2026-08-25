# Evidence-first human review

Status: Accepted
Date: 2026-08-24

## Decision

Komodo prepares a human review. It does not decide that a pull request is safe
to merge and it never submits a GitHub approval.

The AI preflight has four useful responsibilities:

1. Explain the change and its blast radius.
2. Surface source-visible concerns before a person spends time on them.
3. Challenge architectural fit, inappropriate scope, and test adequacy.
4. Produce concrete checks for results that source code cannot establish.

The person reviewing the pull request runs those checks against the real
artifact, records what they observed, resolves the review questions, and makes
the review decision in GitHub.

## Why

Readable source can still produce a broken result. Layout can truncate, a
preview can use different data, an external dependency can reject a
valid-looking request, and a test can pass without covering the behavior a
user depends on. AI-generated pull requests also remove the historical
assumption that the author performed manual verification before opening the
pull request.

Reading the diff remains useful, but for a narrower purpose. It reveals system
boundaries, ownership, unexpected dependencies, test design, and concerns an
agent should normally catch during development. It cannot prove a runtime or
rendered outcome.

## Domain model

One immutable review run owns an ordered verification plan. A requirement says:

- what to do;
- what result to expect;
- which evidence forms are acceptable; and
- whether the check is required.

Evidence entries are append-only. The newest entry for a requirement is its
current result; earlier attempts remain audit history. Requirement identifiers
include a stable content hash, so replacing a plan for the same head cannot
silently attach old evidence to a different check.

The queue derives three independent states:

```text
AI preflight         not requested -> queued -> running -> brief ready / failed
Result verification no plan -> needs evidence -> verified / failed / blocked
Human review         unassigned -> awaiting review -> approved / changes requested
```

No transition in the first two lines causes a transition in the third.

## GitHub behavior

- Full AI reviews use the `COMMENT` event only.
- The commit status context is `komodo/verification`.
- A completed preflight posts a pending verification status.
- Required evidence can update that status to success or failure.
- Status text always states that GitHub approval is separate.
- Receipt comments are human review records or in-progress records, not verdicts.

Legacy `auto_approve`, `request_changes`, and confidence-threshold settings are
ignored with a configuration warning. They are not mapped into stored settings
or exposed in the UI.

## Trust boundary

The browser's actor cookie attributes evidence to a roster member; it is not a
credential. The authenticated HTTP API attributes submissions to the API key
that supplied them. Either can record evidence, but neither grants approval.
Deployments that need identity enforcement must put Komodo behind authentication;
GitHub remains the authority for the required human review.

## Compatibility

Version 2 review rows load with an empty verification plan. The UI states that
the missing plan is not evidence and directs the reviewer to verify the change
directly. New reviews are version 3 and always carry the verification-plan
field, which may still be empty when no meaningful check could be generated.
