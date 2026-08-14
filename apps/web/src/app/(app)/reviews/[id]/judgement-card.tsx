"use client";

import { useState } from "react";
import { Bot, Check, ChevronDown, Copy } from "lucide-react";
import type { Judgement } from "@komodo/core";
import { CHIP_CLASS, KIND_TINT, SeverityChip, cn, SEVERITY_COLOR, isSeverity } from "@komodo/ui";

export function JudgementCard({
  judgement,
  html,
  prUrl,
  defaultOpen = false,
}: {
  judgement: Judgement;
  /** Pre-rendered markdown from the server — marked never runs in the browser. */
  html: string;
  prUrl: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [promptOpen, setPromptOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const color = isSeverity(judgement.severity) ? SEVERITY_COLOR[judgement.severity] : "#6b7280";
  const loc = judgement.endLine
    ? `${judgement.path}:${judgement.line}-${judgement.endLine}`
    : `${judgement.path}:${judgement.line}`;

  function copyPrompt() {
    void navigator.clipboard.writeText(judgement.fixPrompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div
      className="bg-surface border border-border rounded-lg overflow-hidden"
      style={{ borderLeftWidth: 3, borderLeftColor: color }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-hover transition-colors"
      >
        <span className="flex gap-1.5 shrink-0">
          <SeverityChip severity={judgement.severity} />
          <span
            className={CHIP_CLASS}
            style={{
              color: KIND_TINT[judgement.kind].color,
              borderColor: KIND_TINT[judgement.kind].border,
              background: KIND_TINT[judgement.kind].bg,
            }}
          >
            {judgement.kind}
          </span>
        </span>

        <span className="flex-1 min-w-0 text-[13px] font-medium text-text truncate">
          {judgement.title}
        </span>

        <a
          href={`${prUrl}/files`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="hidden md:inline shrink-0 font-mono text-[11px] text-text-faint hover:text-accent hover:underline"
        >
          {loc}
        </a>

        <ChevronDown
          size={14}
          className={cn(
            "shrink-0 text-text-faint transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 pt-3.5 border-t border-border">
          <div className="prose-dark" dangerouslySetInnerHTML={{ __html: html }} />

          <p className="mt-3.5 mb-0 border-l-2 border-accent bg-elevated px-3.5 py-3 font-serif text-base leading-normal text-text">
            {judgement.ask}
          </p>

          <p className="mt-2.5 mb-0 text-xs leading-[1.7] text-text-dim">
            Read from {judgement.sources.join(", ")}. {judgement.sourceNote}
          </p>

          {judgement.suggestion && (
            <div className="mt-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-dim mb-1.5">
                Suggested fix
              </div>
              <pre className="rounded-md border border-border bg-elevated px-3.5 py-3 overflow-x-auto text-xs leading-relaxed font-mono text-[#c9d1d9]">
                {judgement.suggestion}
              </pre>
            </div>
          )}

          <div className="mt-3.5">
            <button
              onClick={() => setPromptOpen((v) => !v)}
              aria-expanded={promptOpen}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-text-muted hover:text-text hover:bg-surface-2 hover:border-border-strong transition-colors"
            >
              <Bot size={13} />
              Prompt for AI agents
              <ChevronDown size={12} className={cn("transition-transform", promptOpen && "rotate-180")} />
            </button>

            {promptOpen && (
              <div className="relative mt-2">
                <pre className="rounded-md border border-border bg-elevated px-3.5 py-3 pr-20 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-relaxed font-mono text-text-muted">
                  {judgement.fixPrompt}
                </pre>
                <button
                  onClick={copyPrompt}
                  className={cn(
                    "absolute top-2 right-2 inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] transition-colors",
                    copied
                      ? "border-accent-border text-accent bg-accent-dim"
                      : "border-border-strong text-text-muted bg-surface-2 hover:text-text",
                  )}
                >
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
