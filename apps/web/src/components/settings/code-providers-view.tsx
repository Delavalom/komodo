"use client";

import * as React from "react";
import { ChevronDown, Clock, Plus, RefreshCw, Unlink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GithubIcon } from "@/components/ui/display";
import { PageTitle } from "@/components/settings/page-title";
import { useRepositories } from "@/lib/data/queries";
import { cn, plural } from "@/lib/utils";

/** SPEC §8.3 */
export function CodeProvidersView() {
  const repos = useRepositories();
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageTitle>Code Providers</PageTitle>
        <Button>
          <Plus className="h-3.5 w-3.5" />
          Add Provider
        </Button>
      </div>

      <Card>
        <div className="flex items-center gap-6 p-4">
          <span className="flex items-center gap-2.5">
            <GithubIcon className="h-6 w-6" />
            <span className="text-[15px]">GitHub</span>
          </span>
          <div className="text-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Last Sync:
            </div>
            <div>~6 hours ago</div>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <ProviderAction label="Resync">
              <RefreshCw className="h-4 w-4" />
            </ProviderAction>
            <ProviderAction label="Add organization">
              <Plus className="h-4 w-4" />
            </ProviderAction>
            <ProviderAction label="Open on GitHub">
              <GithubIcon className="h-4 w-4" />
            </ProviderAction>
            <ProviderAction label="Unlink" destructive>
              <Unlink className="h-4 w-4" />
            </ProviderAction>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-between border-t border-border bg-secondary px-4 py-2.5 text-sm transition-colors hover:bg-muted-accent"
        >
          1 GitHub Organization
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform duration-100",
              expanded ? "rotate-180" : "",
            )}
          />
        </button>

        {expanded ? (
          <div className="border-t border-border px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2.5">
                <GithubIcon className="h-4 w-4" />
                delavalom
              </span>
              <span className="text-muted-foreground">
                {plural(repos.length, "repository", "repositories")}
              </span>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function ProviderAction({
  children,
  label,
  destructive,
}: {
  children: React.ReactNode;
  label: string;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-[2px] transition-colors hover:bg-muted-accent",
        destructive
          ? "text-[hsl(var(--destructive))]"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
