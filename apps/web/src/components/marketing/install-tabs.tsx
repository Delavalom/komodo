"use client";

import { useState } from "react";
import { Copy } from "lucide-react";

import { cn } from "@/lib/utils";

import { Container, MonoLabel, Section } from "./ui";

/**
 * The package-manager tab strip on /cli. docs/SPEC-MARKETING.md §M8.
 *
 * Selection is local state — the original does not put it in the URL, so this
 * clone does not either. The copy button writes to the clipboard and flips a
 * label; there is no effect and no timer, so the label resets on the next
 * interaction rather than on a timeout.
 */
const COMMANDS: { id: string; label: string; command: string }[] = [
  { id: "curl", label: "curl", command: "curl -fsSL https://greptile.com/cli | sh" },
  { id: "npm", label: "npm", command: "npm i -g greptile" },
  { id: "pnpm", label: "pnpm", command: "pnpm add -g greptile" },
  { id: "bun", label: "bun", command: "bun add -g greptile" },
  { id: "brew", label: "brew", command: "brew install greptile" },
];

export function InstallTabs() {
  const [active, setActive] = useState(COMMANDS[0].id);
  const [copied, setCopied] = useState(false);
  const current = COMMANDS.find((c) => c.id === active) ?? COMMANDS[0];

  return (
    <Section className="border-b border-current/10">
      <Container>
        <div className="mx-auto max-w-3xl py-16">
          <div className="flex flex-wrap gap-1">
            {COMMANDS.map((cmd) => (
              <button
                key={cmd.id}
                type="button"
                aria-pressed={cmd.id === active}
                onClick={() => {
                  setActive(cmd.id);
                  setCopied(false);
                }}
                className={cn(
                  "chamfer px-5 py-2 font-label text-[12px] uppercase tracking-[0.14em] transition-colors",
                  cmd.id === active
                    ? "bg-mkt-basalt text-mkt-white"
                    : "bg-current/[0.07] opacity-70 hover:opacity-100",
                )}
              >
                {cmd.label}
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-4 border border-current/15 bg-mkt-basalt px-5 py-4">
            <MonoLabel className="text-mkt-green opacity-80">~$</MonoLabel>
            <code className="flex-1 truncate font-label text-[13px] text-mkt-white">
              {current.command}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(current.command);
                setCopied(true);
              }}
              className="flex shrink-0 items-center gap-2 font-label text-[11px] uppercase tracking-[0.16em] text-mkt-white/70 transition-colors hover:text-mkt-white"
            >
              <Copy size={13} aria-hidden />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      </Container>
    </Section>
  );
}
