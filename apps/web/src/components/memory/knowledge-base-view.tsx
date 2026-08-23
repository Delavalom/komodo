"use client";

import * as React from "react";
import { BookOpen, FileCode2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge, EmptyState, GithubIcon } from "@/components/ui/display";
import { SearchInput } from "@/components/ui/input";
import { DataTable, EmptyRow, TD, TH, THead, TR } from "@/components/ui/table";
import { fullName, useMemoryRules, useRepoIndex } from "@/lib/data/queries";
import { plural } from "@/lib/utils";

/**
 * The files this team has actually taught Komodo from.
 *
 * A file rule names a glob — `CLAUDE.md`, `docs/**\/*.md` — and the reviewer
 * resolves it against the working tree it checked out, then records which
 * paths it read. That ledger is what this screen shows: not what the globs
 * could match, but what was handed to a model, and how often.
 *
 * It was a permanent empty state before, on a store that had the rows all
 * along. The distinction matters, because "no knowledge base yet" and "the
 * reviewer never managed to read your AGENTS.md" look identical from here and
 * are very different problems.
 */
export function KnowledgeBaseView() {
  const [search, setSearch] = React.useState("");
  // Every file rule, not a page of them: this screen lists files, and paging
  // the rules underneath would drop files with no way to ask for the rest.
  const rules = useMemoryRules({ type: "file", perPage: Number.MAX_SAFE_INTEGER });
  const repoIndex = useRepoIndex();

  const rows = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    const out = rules.rows.flatMap((rule) =>
      rule.files.map((file) => ({
        key: `${rule.id}:${file.path}`,
        path: file.path,
        uses: file.uses,
        rule: rule.description,
        pattern: rule.pattern,
        repo: rule.repoId ? repoIndex.get(rule.repoId) : null,
      })),
    );
    const filtered = needle
      ? out.filter((row) =>
          `${row.path} ${row.rule} ${row.pattern}`.toLowerCase().includes(needle),
        )
      : out;
    return filtered.sort((a, b) => b.uses - a.uses || a.path.localeCompare(b.path));
  }, [rules.rows, search, repoIndex]);

  // A team with no file rules at all is being told something different from a
  // team whose rules have not been read yet, so the two states say so.
  const hasFileRules = rules.rows.length > 0;

  return (
    <div className="min-w-0 flex-1 overflow-y-auto px-6 py-6">
      {hasFileRules ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <SearchInput
              wrapperClassName="flex-1"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by path or rule"
            />
            <span className="text-sm text-muted-foreground">
              {plural(rows.length, "file")}
            </span>
          </div>

          <DataTable>
            <THead>
              <tr>
                <TH>File</TH>
                <TH className="w-[320px]">From rule</TH>
                <TH className="w-[140px]">Reviews read in</TH>
              </tr>
            </THead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={3}>
                  {search
                    ? "No file matches that search"
                    : "No file has been read yet — the next review that touches a matching path will fill this in"}
                </EmptyRow>
              ) : (
                rows.map((row) => (
                  <TR key={row.key}>
                    <TD>
                      <span className="flex items-center gap-2.5">
                        <FileCode2 className="h-4 w-4 shrink-0 text-[hsl(var(--chart-2))]" />
                        <span className="truncate font-mono text-[13px]">
                          {row.path}
                        </span>
                      </span>
                    </TD>
                    <TD>
                      <div className="truncate text-sm">{row.rule}</div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        {row.repo ? (
                          <span className="flex items-center gap-1.5">
                            <GithubIcon className="h-3.5 w-3.5" />
                            {fullName(row.repo)}
                          </span>
                        ) : (
                          <span>All repositories</span>
                        )}
                        <Badge tone="outline">{row.pattern}</Badge>
                      </div>
                    </TD>
                    <TD className="text-muted-foreground">
                      {plural(row.uses, "review")}
                    </TD>
                  </TR>
                ))
              )}
            </tbody>
          </DataTable>
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={<BookOpen className="h-6 w-6" />}
            title="No knowledge base yet"
            description="Add a file rule on the Custom rules tab pointing at your CLAUDE.md, AGENTS.md or .cursorrules. The reviewer reads them off the working tree it checks out, and every file it reads is listed here."
          />
        </Card>
      )}
    </div>
  );
}
