"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDismiss } from "./use-dismiss";
import { CloseGlyph } from "./display";

/**
 * The chip/facet search box used on Pull Requests and Memory.
 * and §7.1 — including the exact popover copy.
 */

export interface FacetValue {
  value: string;
  label: string;
}

export interface FacetDef {
  /** The token typed before the colon, and the query-param name. */
  key: string;
  /** Placeholder shown to the right of `key:` in the facet menu. */
  example: string;
  icon: React.ReactNode;
  /** Enumerated values; omit for a free-text facet such as `confidence:`. */
  values?: FacetValue[];
  /** Values are resolved lazily (repos, authors). */
  loadValues?: () => FacetValue[];
}

export interface FilterInputProps {
  facets: FacetDef[];
  active: Record<string, string>;
  onChange: (key: string, value: string | null) => void;
  search: string;
  onSearchChange: (next: string) => void;
  placeholder: string;
  className?: string;
}

export function FilterInput({
  facets,
  active,
  onChange,
  search,
  onSearchChange,
  placeholder,
  className,
}: FilterInputProps) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const close = React.useCallback(() => {
    setOpen(false);
    setPending(null);
    setDraft("");
  }, []);
  const wrapperRef = useDismiss<HTMLDivElement>(open, close);

  const activeKeys = Object.keys(active).filter((k) => active[k]);
  const available = facets.filter(
    (f) => !activeKeys.includes(f.key) && f.key !== pending,
  );
  const pendingFacet = facets.find((f) => f.key === pending) ?? null;
  const pendingValues = pendingFacet
    ? (pendingFacet.values ?? pendingFacet.loadValues?.() ?? [])
    : [];
  const filteredPendingValues = pendingValues.filter((v) =>
    v.label.toLowerCase().includes(draft.trim().toLowerCase()),
  );

  function commit(facetKey: string, value: string) {
    onChange(facetKey, value);
    setPending(null);
    setDraft("");
    setOpen(false);
  }

  function startFacet(facetKey: string) {
    setPending(facetKey);
    setDraft("");
    onSearchChange("");
    setOpen(true);
    inputRef.current?.focus();
  }

  function handleChange(raw: string) {
    if (pending) {
      setDraft(raw);
      return;
    }
    const shortcut = raw.match(/^\s*([a-z]+):\s*$/i);
    if (shortcut) {
      const match = facets.find(
        (f) => f.key.toLowerCase() === shortcut[1].toLowerCase(),
      );
      if (match) {
        startFacet(match.key);
        return;
      }
    }
    onSearchChange(raw);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace") {
      if (pending && draft === "") {
        event.preventDefault();
        setPending(null);
        return;
      }
      if (!pending && search === "" && activeKeys.length > 0) {
        event.preventDefault();
        onChange(activeKeys[activeKeys.length - 1], null);
      }
      return;
    }
    if (event.key === "Enter" && pending) {
      event.preventDefault();
      const exact = filteredPendingValues[0];
      if (exact) commit(pending, exact.value);
      else if (draft.trim()) commit(pending, draft.trim());
    }
  }

  const labelFor = (facetKey: string, value: string) => {
    const facet = facets.find((f) => f.key === facetKey);
    const values = facet?.values ?? facet?.loadValues?.() ?? [];
    return values.find((v) => v.value === value)?.label ?? value;
  };

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <div
        onClick={() => {
          setOpen(true);
          inputRef.current?.focus();
        }}
        className={cn(
          "flex min-h-9 w-full cursor-text flex-wrap items-center gap-1.5 rounded-[2px]",
          "border border-border bg-card px-2.5 py-1 transition-colors duration-100",
          open ? "border-[hsl(var(--ring))]" : "",
        )}
      >
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />

        {activeKeys.map((key) => {
          const facet = facets.find((f) => f.key === key);
          return (
            <span
              key={key}
              className="inline-flex items-center gap-1.5 rounded-[2px] bg-secondary px-1.5 py-1 text-[13px]"
            >
              <span className="text-muted-foreground">{facet?.icon}</span>
              <span className="label-mono text-[11px] text-muted-foreground">
                {key} =
              </span>
              <span>{labelFor(key, active[key])}</span>
              <button
                type="button"
                aria-label={`Remove ${key} filter`}
                onClick={(event) => {
                  event.stopPropagation();
                  onChange(key, null);
                }}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <CloseGlyph />
              </button>
            </span>
          );
        })}

        {pendingFacet ? (
          <span className="relative inline-flex items-center gap-1.5 rounded-[2px] border border-[hsl(var(--ring))] bg-secondary px-1.5 py-1 text-[13px]">
            <span className="text-muted-foreground">{pendingFacet.icon}</span>
            <span className="label-mono text-[11px] text-muted-foreground">
              {pendingFacet.key} =
            </span>
            <input
              ref={inputRef}
              value={draft}
              autoFocus
              onChange={(event) => handleChange(event.target.value)}
              onKeyDown={handleKeyDown}
              className="w-16 bg-transparent text-[13px] outline-none"
            />
            <button
              type="button"
              aria-label="Cancel filter"
              onClick={(event) => {
                event.stopPropagation();
                setPending(null);
                setDraft("");
              }}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <CloseGlyph />
            </button>
            {open ? (
              <div className="absolute left-0 top-full z-50 mt-1 min-w-[254px] rounded-[2px] border border-border bg-popover shadow-lg">
                {filteredPendingValues.length ? (
                  <div className="max-h-[320px] overflow-y-auto py-1">
                    {filteredPendingValues.map((v) => (
                      <button
                        key={v.value}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          commit(pendingFacet.key, v.value);
                        }}
                        className="block w-full border-b border-border px-4 py-2.5 text-left text-sm transition-colors last:border-b-0 hover:bg-muted-accent"
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-2.5 text-sm text-muted-foreground">
                    Press Enter to filter by “{draft.trim() || "…"}”
                  </div>
                )}
              </div>
            ) : null}
          </span>
        ) : (
          <input
            ref={inputRef}
            value={search}
            onFocus={() => setOpen(true)}
            onChange={(event) => handleChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={activeKeys.length ? "Add more filters…" : placeholder}
            className="h-7 min-w-[160px] flex-1 bg-transparent text-sm outline-none"
          />
        )}
      </div>

      {open && !pendingFacet ? (
        <div className="absolute left-0 top-full z-50 mt-1 w-[322px] rounded-[2px] border border-border bg-popover shadow-lg">
          <div className="px-4 py-2.5 text-[13px] text-muted-foreground">
            Type a filter shortcut, choose below, or keep searching
          </div>
          {available.map((facet) => (
            <button
              key={facet.key}
              type="button"
              onClick={() => startFacet(facet.key)}
              className="flex w-full items-center gap-2.5 border-t border-border px-4 py-2.5 text-left transition-colors hover:bg-muted-accent"
            >
              <span className="text-muted-foreground">{facet.icon}</span>
              <span className="label-mono text-[12px] text-muted-foreground">
                {facet.key}:
              </span>
              <span className="text-sm">{facet.example}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
