"use client";

import * as React from "react";
import {
  BarChart3,
  FileCode2,
  GitBranch,
  Pencil,
  Percent,
  Settings as SettingsIcon,
  TrendingUp,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import {
  GithubIcon,
  Pagination,
  StatusPill,
  Tooltip,
} from "@/components/ui/display";
import { FilterInput, type FacetDef } from "@/components/ui/filter-input";
import { DataTable, EmptyRow, TD, TH, THead, TR } from "@/components/ui/table";
import { AddContextModal } from "@/components/memory/add-context-modal";
import { MemoryDrawer } from "@/components/memory/drawer";
import {
  fullName,
  useMemoryRule,
  useMemoryRules,
  useRepoIndex,
  useRepositories,
} from "@/lib/data/queries";
import { useUrlState } from "@/lib/use-url-state";
import { percent, plural, relativeTime } from "@/lib/utils";
import type { MemoryQuery } from "@/lib/types";

const FACET_KEYS = ["repository", "type", "status", "usage", "acceptance"] as const;

export function CustomRulesView() {
  const { get, set } = useUrlState();
  const repos = useRepositories();
  const repoIndex = useRepoIndex();

  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [page, setPage] = React.useState(0);
  const [addOpen, setAddOpen] = React.useState(false);
  const [drawerMode, setDrawerMode] =
    React.useState<"analytics" | "edit">("analytics");
  const [sort, setSort] = React.useState<{
    by: MemoryQuery["sortBy"];
    dir: "asc" | "desc";
  }>({ by: undefined, dir: "desc" });

  const active: Record<string, string> = {};
  for (const key of FACET_KEYS) {
    const value = get(key);
    if (value) active[key] = value;
  }

  const openId = get("memory") ?? null;
  const openRule = useMemoryRule(openId);

  const facets: FacetDef[] = [
    {
      key: "repository",
      example: "org/repository",
      icon: <GitBranch className="h-3.5 w-3.5" />,
      loadValues: () =>
        repos.map((r) => ({ value: fullName(r), label: fullName(r) })),
    },
    {
      key: "type",
      example: "rule",
      icon: <FileCode2 className="h-3.5 w-3.5" />,
      values: [
        { value: "rule", label: "rule" },
        { value: "file", label: "file" },
      ],
    },
    {
      key: "status",
      example: "active",
      icon: <SettingsIcon className="h-3.5 w-3.5" />,
      values: [
        { value: "active", label: "active" },
        { value: "inactive", label: "inactive" },
      ],
    },
    {
      key: "usage",
      example: "> 5",
      icon: <TrendingUp className="h-3.5 w-3.5" />,
    },
    {
      key: "acceptance",
      example: "< 30%",
      icon: <Percent className="h-3.5 w-3.5" />,
    },
  ];

  const result = useMemoryRules({
    search,
    repository: active.repository,
    type: active.type as MemoryQuery["type"],
    status: active.status as MemoryQuery["status"],
    usage: active.usage,
    acceptance: active.acceptance,
    sortBy: sort.by,
    sortDir: sort.dir,
    page,
  });

  const allSelected =
    result.rows.length > 0 && selected.length === result.rows.length;

  function toggleSort(by: NonNullable<MemoryQuery["sortBy"]>) {
    setSort((prev) =>
      prev.by === by
        ? { by, dir: prev.dir === "desc" ? "asc" : "desc" }
        : { by, dir: "desc" },
    );
  }

  function openDrawer(id: string, mode: "analytics" | "edit") {
    setDrawerMode(mode);
    set({ memory: id });
  }

  return (
    <>
      <div className="min-w-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="flex items-center gap-3">
          <FilterInput
            className="flex-1"
            facets={facets}
            active={active}
            onChange={(key, value) => set({ [key]: value })}
            search={search}
            onSearchChange={setSearch}
            placeholder="Search context or click to add filters"
          />
          <Button onClick={() => setAddOpen(true)}>
            <span className="text-base leading-none">+</span>
            Add Context
          </Button>
        </div>

        <div className="flex h-12 items-center text-sm text-muted-foreground">
          {selected.length} selected
        </div>

        <DataTable>
          <THead>
            <tr>
              <TH className="w-12">
                <Checkbox
                  checked={allSelected}
                  indeterminate={selected.length > 0 && !allSelected}
                  onChange={(next) =>
                    setSelected(next ? result.rows.map((r) => r.id) : [])
                  }
                  label="Select all rules"
                />
              </TH>
              <TH>Description</TH>
              <TH className="w-[104px]">Type</TH>
              <TH
                className="w-[118px]"
                sortable
                sorted={sort.by === "usage" ? sort.dir : null}
                onSort={() => toggleSort("usage")}
              >
                Usage
              </TH>
              <TH
                className="w-[132px]"
                sortable
                sorted={sort.by === "acceptance" ? sort.dir : null}
                onSort={() => toggleSort("acceptance")}
              >
                <span className="inline-flex items-center gap-1">
                  Addressed Rate
                  <Tooltip content="Share of Greptile comments citing this rule that were resolved by follow-up code changes.">
                    <span className="text-[10px]">ⓘ</span>
                  </Tooltip>
                </span>
              </TH>
              <TH
                className="w-[112px]"
                sortable
                sorted={sort.by === "status" ? sort.dir : null}
                onSort={() => toggleSort("status")}
              >
                Status
              </TH>
              <TH className="w-[104px]">Actions</TH>
            </tr>
          </THead>
          <tbody>
            {result.rows.length === 0 ? (
              <EmptyRow colSpan={7}>No context found</EmptyRow>
            ) : (
              result.rows.map((rule) => {
                const repo = rule.repoId ? repoIndex.get(rule.repoId) : null;
                const checked = selected.includes(rule.id);
                return (
                  <TR key={rule.id}>
                    <TD>
                      <Checkbox
                        checked={checked}
                        onChange={(next) =>
                          setSelected((prev) =>
                            next
                              ? [...prev, rule.id]
                              : prev.filter((id) => id !== rule.id),
                          )
                        }
                        label={`Select ${rule.description}`}
                      />
                    </TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[15px]">
                          {rule.description}
                        </span>
                        {rule.files.length ? (
                          <span className="shrink-0 rounded-[2px] bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            {plural(rule.files.length, "file")}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        {repo ? (
                          <>
                            <GithubIcon className="h-3.5 w-3.5" />
                            <span>{repo.name}</span>
                          </>
                        ) : (
                          <span>All repositories</span>
                        )}
                        <span>{relativeTime(rule.updatedAt)}</span>
                      </div>
                    </TD>
                    <TD>
                      <FileCode2 className="h-4 w-4 text-[hsl(var(--chart-2))]" />
                    </TD>
                    <TD>{rule.usageCount}</TD>
                    <TD>
                      {rule.acceptanceRate === null
                        ? "—"
                        : percent(rule.acceptanceRate)}
                    </TD>
                    <TD>
                      <StatusPill
                        tone={rule.status === "active" ? "default" : "warn"}
                      >
                        {rule.status}
                      </StatusPill>
                    </TD>
                    <TD>
                      <div className="flex items-center gap-1">
                        <Tooltip content="Analytics">
                          <button
                            type="button"
                            aria-label="Analytics"
                            onClick={() => openDrawer(rule.id, "analytics")}
                            className="flex h-7 w-7 items-center justify-center rounded-[2px] text-muted-foreground transition-colors hover:bg-muted-accent hover:text-foreground"
                          >
                            <BarChart3 className="h-4 w-4" />
                          </button>
                        </Tooltip>
                        <Tooltip content="Edit">
                          <button
                            type="button"
                            aria-label="Edit"
                            onClick={() => openDrawer(rule.id, "edit")}
                            className="flex h-7 w-7 items-center justify-center rounded-[2px] text-muted-foreground transition-colors hover:bg-muted-accent hover:text-foreground"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        </Tooltip>
                      </div>
                    </TD>
                  </TR>
                );
              })
            )}
          </tbody>
        </DataTable>

        <Pagination
          page={result.page}
          perPage={result.perPage}
          total={result.total}
          pageCount={result.pageCount}
          onPageChange={setPage}
        />
      </div>

      {openRule ? (
        <MemoryDrawer
          rule={openRule}
          mode={drawerMode}
          onModeChange={setDrawerMode}
          onClose={() => set({ memory: null })}
        />
      ) : null}

      <AddContextModal open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
}
