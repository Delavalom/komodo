import { useState } from "react";
import type { Judgement, PR } from "../types";
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

interface Props {
  judgement: Judgement;
  pr: Pick<PR, "owner" | "repo" | "number">;
  defaultOpen?: boolean;
}

export function JudgementCard({ judgement, pr, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [promptOpen, setPromptOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const color = SEVERITY_COLOR[judgement.severity] ?? "var(--text-dim)";
  const diffUrl = `https://github.com/${pr.owner}/${pr.repo}/pull/${pr.number}/files`;
  const locLabel = judgement.endLine
    ? `${judgement.path}:${judgement.line}-${judgement.endLine}`
    : `${judgement.path}:${judgement.line}`;

  function copyPrompt() {
    navigator.clipboard.writeText(judgement.fixPrompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className={`judgement-card judgement-card--${judgement.severity}`}>
      <button
        className="judgement-card__header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="judgement-card__chips">
          <span
            className="chip"
            style={{
              background: `color-mix(in srgb, ${color} 15%, transparent)`,
              color,
              borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
            }}
          >
            {SEVERITY_LABEL[judgement.severity]}
          </span>
          <span className="chip chip--cat">{judgement.kind}</span>
        </div>

        <span className="judgement-card__title">{judgement.title}</span>

        <span className="judgement-card__loc">
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

        <span className="judgement-card__chevron">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="judgement-card__body">
          <MarkdownBlock content={`${judgement.lede}\n\n${judgement.detail}`} />

          <p className="judgement-card__ask">{judgement.ask}</p>

          <p className="judgement-card__sources">
            Read from {judgement.sources.join(", ")}. {judgement.sourceNote}
          </p>

          {judgement.suggestion && (
            <div className="judgement-card__suggestion">
              <div className="judgement-card__suggestion-label">Suggested fix</div>
              <pre className="code-block">
                <code>{judgement.suggestion}</code>
              </pre>
            </div>
          )}

          <div className="judgement-card__prompt-section">
            <button
              className="prompt-toggle"
              onClick={() => setPromptOpen((v) => !v)}
              aria-expanded={promptOpen}
            >
              🤖 Prompt for AI agents {promptOpen ? "▲" : "▼"}
            </button>

            {promptOpen && (
              <div className="judgement-card__prompt">
                <pre className="code-block code-block--prompt">{judgement.fixPrompt}</pre>
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
