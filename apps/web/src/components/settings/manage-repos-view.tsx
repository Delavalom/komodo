"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Checkbox, Toggle } from "@/components/ui/controls";
import { GithubIcon } from "@/components/ui/display";
import { SearchInput } from "@/components/ui/input";
import { DataTable, EmptyRow, TD, TH, THead, TR } from "@/components/ui/table";
import { PageTitle } from "@/components/settings/page-title";
import { fullName, useRepositorySearch } from "@/lib/data/queries";
import { useSetRepoEnabled } from "@/lib/data/mutations";
import { plural } from "@/lib/utils";

export function ManageReposView() {
  const [query, setQuery] = React.useState("");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc" | null>(null);
  const [statusDir, setStatusDir] = React.useState<"asc" | "desc" | null>(null);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [pending, setPending] = React.useState(false);
  const repos = useRepositorySearch(query);
  const setEnabled = useSetRepoEnabled();

  /**
   * The selection used to count rows and do nothing with them. Enabling a
   * repository is what puts it in front of the poller — see poll.ts, where
   * `enabled` is the only filter — so doing it thirty times by hand after a
   * scan is the thing worth saving.
   */
  async function setSelectedEnabled(enabled: boolean) {
    setPending(true);
    try {
      for (const id of selected) await setEnabled(id, enabled);
      setSelected([]);
    } finally {
      setPending(false);
    }
  }

  const rows = React.useMemo(() => {
    const copy = [...repos];
    if (sortDir) {
      copy.sort((a, b) =>
        sortDir === "asc"
          ? a.reviewCount - b.reviewCount
          : b.reviewCount - a.reviewCount,
      );
    } else if (statusDir) {
      copy.sort((a, b) =>
        statusDir === "asc"
          ? Number(a.enabled) - Number(b.enabled)
          : Number(b.enabled) - Number(a.enabled),
      );
    }
    return copy;
  }, [repos, sortDir, statusDir]);

  const allSelected = rows.length > 0 && selected.length === rows.length;

  return (
    <div className="space-y-4">
      <PageTitle>Manage Repositories</PageTitle>
      <SearchInput
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search for repos by name"
      />
      <p className="text-sm text-muted-foreground">
        An enabled repository is polled for open pull requests; a disabled one
        is left alone. The list is what the deployment&apos;s GitHub token can
        see for each owner it already knows — Code Providers rescans it.
      </p>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">
          {selected.length} selected
        </span>
        {selected.length > 0 ? (
          <>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => setSelectedEnabled(true)}
            >
              Enable
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => setSelectedEnabled(false)}
            >
              Disable
            </Button>
          </>
        ) : null}
      </div>

      <DataTable>
        <THead>
          <tr>
            <TH className="w-12">
              <Checkbox
                checked={allSelected}
                indeterminate={selected.length > 0 && !allSelected}
                onChange={(next) =>
                  setSelected(next ? rows.map((r) => r.id) : [])
                }
                label="Select all repositories"
              />
            </TH>
            <TH>Repo</TH>
            <TH
              className="w-[374px]"
              sortable
              sorted={sortDir}
              onSort={() => {
                setStatusDir(null);
                setSortDir((d) => (d === "desc" ? "asc" : "desc"));
              }}
            >
              Reviews
            </TH>
            <TH
              className="w-[374px]"
              sortable
              sorted={statusDir}
              onSort={() => {
                setSortDir(null);
                setStatusDir((d) => (d === "desc" ? "asc" : "desc"));
              }}
            >
              Status
            </TH>
          </tr>
        </THead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyRow colSpan={4}>No repositories found</EmptyRow>
          ) : (
            rows.map((repo) => (
              <TR key={repo.id}>
                <TD>
                  <Checkbox
                    checked={selected.includes(repo.id)}
                    onChange={(next) =>
                      setSelected((prev) =>
                        next
                          ? [...prev, repo.id]
                          : prev.filter((id) => id !== repo.id),
                      )
                    }
                    label={`Select ${fullName(repo)}`}
                  />
                </TD>
                <TD>
                  <span className="flex items-center gap-2.5">
                    <GithubIcon className="h-4 w-4" />
                    {fullName(repo)}
                  </span>
                </TD>
                <TD className="text-muted-foreground">
                  {plural(repo.reviewCount, "review")}
                </TD>
                <TD>
                  <span className="flex items-center gap-3">
                    <Toggle
                      checked={repo.enabled}
                      onChange={(next) => setEnabled(repo.id, next)}
                      label={`Toggle ${fullName(repo)}`}
                    />
                    <span className="text-sm">
                      {repo.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </span>
                </TD>
              </TR>
            ))
          )}
        </tbody>
      </DataTable>
    </div>
  );
}
