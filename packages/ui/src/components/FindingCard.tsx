import { useState } from "react";
import type { Finding, PR } from "../types";
import { MarkdownBlock } from "./MarkdownBlock";

const SEVERITY_COLOR: Record<string, string> = {
  critical: "var(--c-critical)",
  major: "var(--c-major)",
  minor: "var(--c-minor)",
  trivial: "var(--c-trivial)",
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: "Critical",
  major: "Major",
  minor: "Minor",
  trivial: "Trivial",
};

const CATEGORY_LABEL: Record<string, string> = {
  security: "Security",
  correctness: "Correctness",
  performance: "Performance",
  maintainability: "Maintainability",
  "data-integrity": "Data Integrity",
  stability: "Stability",
};

interface Props {
  finding: Finding;
  pr: Pick<PR, "owner" | "repo" | "number">;
  defaultOpen?: boolean;
}

export function FindingCard({ finding, pr, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [promptOpen, setPromptOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const color = SEVERITY_COLOR[finding.severity] ?? "var(--text-dim)";
  const diffUrl = `https://github.com/${pr.owner}/${pr.repo}/pull/${pr.number}/files`;
  const locLabel = finding.endLine
    ? `${finding.path}:${finding.line}-${finding.endLine}`
    : `${finding.path}:${finding.line}`;

  function copyPrompt() {
    navigator.clipboard.writeText(finding.fixPrompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className={`finding-card finding-card--${finding.severity}`}>
      <button
        className="finding-card__header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="finding-card__chips">
          <span
            className="chip"
            style={{
              background: `color-mix(in srgb, ${color} 15%, transparent)`,
              color,
              borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
            }}
          >
            {SEVERITY_LABEL[finding.severity]}
          </span>
          <span className="chip chip--cat">{CATEGORY_LABEL[finding.category]}</span>
        </div>

        <span className="finding-card__title">{finding.title}</span>

        <span className="finding-card__loc">
          <a
            href={diffUrl}
            target="_blank"
            rel="noreferrer"
            className="loc-link"
            onClick={(e) => e.stopPropagation()}
          >
            {locLabel}
          </a>
        </span>

        <span className="finding-card__chevron">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="finding-card__body">
          <MarkdownBlock content={finding.body} />

          {finding.suggestion && (
            <div className="finding-card__suggestion">
              <div className="finding-card__suggestion-label">Suggested fix</div>
              <pre className="code-block">
                <code>{finding.suggestion}</code>
              </pre>
            </div>
          )}

          <div className="finding-card__prompt-section">
            <button
              className="prompt-toggle"
              onClick={() => setPromptOpen((v) => !v)}
              aria-expanded={promptOpen}
            >
              🤖 Prompt for AI agents {promptOpen ? "▲" : "▼"}
            </button>

            {promptOpen && (
              <div className="finding-card__prompt">
                <pre className="code-block code-block--prompt">{finding.fixPrompt}</pre>
                <button
                  className={`copy-btn${copied ? " copy-btn--copied" : ""}`}
                  onClick={copyPrompt}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
