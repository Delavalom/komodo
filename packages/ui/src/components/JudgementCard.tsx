"use client";

import { useState } from "react";
import type { Judgement, PR } from "../types";
import { MarkdownBlock } from "./MarkdownBlock";

const SEVERITY_COLOR: Record<string, string> = {
  critical: "var(--color-critical)",
  major: "var(--color-major)",
  minor: "var(--color-minor)",
  trivial: "var(--color-trivial)",
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: "Critical",
  major: "Major",
  minor: "Minor",
  trivial: "Trivial",
};

/* Shared chip geometry only. Anything the two variants disagree on
   (case, weight, size, tracking) is set per-variant — Tailwind resolves
   competing utilities by stylesheet order, not by order in the class
   string, so a base+override pair here would be a coin flip. */
const CHIP = "inline-block px-2 py-0.5 rounded border whitespace-nowrap leading-[1.6]";
const CHIP_SEVERITY = "text-[10px] font-bold uppercase tracking-[0.05em]";
const CHIP_KIND = "text-[11px] font-medium bg-surface-2 text-text-muted border-border";
const EYEBROW = "text-[10px] font-bold tracking-[0.08em] uppercase text-text-dim mb-1.5";
const CODE_BLOCK =
  "bg-[#0d1117] border border-border rounded-md py-3 overflow-x-auto text-xs leading-[1.7] [tab-size:2]";

interface Props {
  judgement: Judgement;
  pr: Pick<PR, "owner" | "repo" | "number">;
  defaultOpen?: boolean;
}

export function JudgementCard({ judgement, pr, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [promptOpen, setPromptOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const color = SEVERITY_COLOR[judgement.severity] ?? "var(--color-text-dim)";
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
    <div
      className="bg-surface border border-border border-l-[3px] rounded-md overflow-hidden"
      style={{ borderLeftColor: color }}
    >
      <button
        className="w-full flex items-center gap-2.5 px-4 py-[13px] text-left text-text text-[13px] cursor-pointer transition-colors hover:bg-hover max-[800px]:flex-wrap max-[800px]:gap-2"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="flex gap-1.5 shrink-0">
          <span
            className={`${CHIP} ${CHIP_SEVERITY}`}
            style={{
              background: `color-mix(in srgb, ${color} 15%, transparent)`,
              color,
              borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
            }}
          >
            {SEVERITY_LABEL[judgement.severity]}
          </span>
          <span className={`${CHIP} ${CHIP_KIND}`}>{judgement.kind}</span>
        </div>

        <span className="flex-1 font-medium text-[13px] text-text min-w-0 leading-[1.4]">
          {judgement.title}
        </span>

        <span className="shrink-0 max-[800px]:hidden">
          <a
            href={diffUrl}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] text-text-dim whitespace-nowrap transition-colors hover:text-accent hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {locLabel}
          </a>
        </span>

        <span className="text-[10px] text-text-dim shrink-0">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-4 pt-3.5 pb-4 border-t border-border">
          <MarkdownBlock content={`${judgement.lede}\n\n${judgement.detail}`} />

          <p className="mt-3.5 px-3.5 py-3 border-l-2 border-accent bg-elevated text-text text-sm leading-[1.5]">
            {judgement.ask}
          </p>

          <p className="mt-2.5 text-text-dim text-xs leading-[1.7]">
            Read from {judgement.sources.join(", ")}. {judgement.sourceNote}
          </p>

          {judgement.suggestion && (
            <div className="mt-4">
              <div className={EYEBROW}>Suggested fix</div>
              <pre className={`${CODE_BLOCK} px-3.5 whitespace-pre text-[#c9d1d9]`}>
                <code>{judgement.suggestion}</code>
              </pre>
            </div>
          )}

          <div className="mt-3.5">
            <button
              className="border border-border rounded-md text-text-muted text-xs px-2.5 py-[5px] cursor-pointer transition-colors flex items-center gap-1.5 hover:bg-surface-2 hover:text-text hover:border-border-strong"
              onClick={() => setPromptOpen((v) => !v)}
              aria-expanded={promptOpen}
            >
              🤖 Prompt for AI agents {promptOpen ? "▲" : "▼"}
            </button>

            {promptOpen && (
              <div className="mt-2 relative">
                <pre
                  className={`${CODE_BLOCK} pl-3.5 pr-[70px] whitespace-pre-wrap break-words text-text-muted`}
                >
                  {judgement.fixPrompt}
                </pre>
                <button
                  className={`absolute top-2 right-2 bg-surface-2 border rounded text-[11px] px-2.5 py-[3px] cursor-pointer transition-colors z-[1] ${
                    copied
                      ? "text-accent border-accent-border"
                      : "text-text-muted border-border-strong hover:text-text hover:bg-hover"
                  }`}
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
