# Approved differential divergences

Per `01-standards.md` §S3: every intentional, accepted difference a
differential test finds between `specToMermaid` and `renderDiagram` goes
here, one line each — `input id`, `expected difference`, `reason` — instead
of being silently special-cased inside the test. This is the first
differential test in `packages/diagram`, so this file establishes the
pattern there.

One asymmetry is known but not exercised by `renderers.differential.test.ts`
(its generated labels avoid the characters that trigger it), so it's
recorded here rather than silently relied on:

| input id | expected difference | reason |
|---|---|---|
| a label containing `"` | `specToMermaid`'s `quote()` rewrites an embedded `"` to `'` (so the Mermaid string stays validly quoted); `renderDiagram`'s `escapeXml` instead emits `&quot;`, keeping the original character data. | Each output has a different thing it must stay valid for — Mermaid's own quoted-string syntax vs. XML — and a label with a literal `"` is the one input where satisfying both would require picking a single escaping rule, which neither renderer needs to do for every other input. |
