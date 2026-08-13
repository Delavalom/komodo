"use client";

import { useState } from "react";
import { Bot, Check, ChevronDown, Copy } from "lucide-react";
import type { Finding } from "@komodo/core";
import { CategoryChip, SeverityChip, cn, SEVERITY_COLOR, isSeverity } from "@/components/ui";

export function FindingCard({
  finding,
  html,
  prUrl,
  defaultOpen = false,
}: {
  finding: Finding;
  /** Pre-rendered markdown from the server — marked never runs in the browser. */
  html: string;
  prUrl: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [promptOpen, setPromptOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const color = isSeverity(finding.severity) ? SEVERITY_COLOR[finding.severity] : "#6b7280";
  const loc = finding.endLine
    ? `${finding.path}:${finding.line}-${finding.endLine}`
    : `${finding.path}:${finding.line}`;

  function copyPrompt() {
    void navigator.clipboard.writeText(finding.fixPrompt).then(() => {
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
          <SeverityChip severity={finding.severity} />
          <CategoryChip category={finding.category} />
        </span>

        <span className="flex-1 min-w-0 text-[13px] font-medium text-text truncate">
          {finding.title}
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

          {finding.suggestion && (
            <div className="mt-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-dim mb-1.5">
                Suggested fix
              </div>
              <pre className="rounded-md border border-border bg-elevated px-3.5 py-3 overflow-x-auto text-xs leading-relaxed font-mono text-[#c9d1d9]">
                {finding.suggestion}
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
                  {finding.fixPrompt}
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
