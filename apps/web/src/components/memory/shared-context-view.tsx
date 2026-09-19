"use client";

import * as React from "react";
import { FolderGit2 } from "lucide-react";

import { Card, SectionHeading } from "@/components/ui/card";
import { Badge, EmptyState } from "@/components/ui/display";
import { DataTable, TD, TH, THead, TR } from "@/components/ui/table";
import { useNow } from "@/lib/data/provider";
import { useRepoClusters } from "@/lib/data/queries";
import type { SharedContextStatus } from "@/lib/data/shared-context";
import { plural, relativeTime } from "@/lib/utils";

/**
 * `context.sources` in komodo.yaml, read-only.
 *
 * There is no control here on purpose — see docs/architecture/shared-context
 * -sources.md's "Configuration" section, which gives the same reasoning
 * voice.extra does: a fact declared in the deployment's own file has no
 * settings-screen twin to agree with forever. This shows what was configured
 * and — separately — what the reviewer last actually resolved, because those
 * can disagree (a folder moved, a file's frontmatter stopped parsing) and the
 * screen exists to say so rather than assume the file describes reality.
 */
export function SharedContextSection({ status }: { status: SharedContextStatus }) {
  const now = useNow();
  const clusterNames = new Set(useRepoClusters().map((c) => c.name.trim().toLowerCase()));

  if (!status.configured.length) {
    return (
      <Card>
        <EmptyState
          icon={<FolderGit2 className="h-6 w-6" />}
          title="No shared context sources configured"
          description={
            'Point komodo.yaml at a folder — typically a checkout of an org-wide review-rules repository — and every markdown file in it is handed to the reviewer. Add a "context: sources:" block; see the README\'s Custom context section.'
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Shared context sources"
        subtitle="From `context.sources` in komodo.yaml. Read-only here — edit the file and the next review picks it up."
      />
      {status.configured.map((source) => {
        const resolved = status.record?.sources.find(
          (s) => s.configuredPath === source.path && s.name === (source.name ?? s.name),
        );
        return (
          <SourceCard
            key={source.path}
            name={source.name ?? source.path}
            configuredPath={source.path}
            repos={source.repos}
            clusters={source.clusters}
            resolved={resolved}
            clusterNames={clusterNames}
            now={now}
            resolvedAt={status.record?.resolvedAt}
          />
        );
      })}
    </div>
  );
}

function SourceCard({
  name,
  configuredPath,
  repos,
  clusters,
  resolved,
  clusterNames,
  now,
  resolvedAt,
}: {
  name: string;
  configuredPath: string;
  repos: string[];
  clusters: string[];
  resolved: import("@komodo/store").SharedContextSourceRecord | undefined;
  clusterNames: Set<string>;
  now: number;
  resolvedAt: number | undefined;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-base font-medium">{name}</div>
          <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
            {configuredPath}
            {resolved?.root ? ` → ${resolved.root}` : ""}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {repos.map((r) => (
              <Badge key={r} tone="outline">
                repo: {r}
              </Badge>
            ))}
            {clusters.map((c) => (
              <Badge key={c} tone={clusterNames.has(c.trim().toLowerCase()) ? "outline" : "muted"}>
                cluster: {c}
                {!clusterNames.has(c.trim().toLowerCase()) ? " (not found)" : ""}
              </Badge>
            ))}
          </div>
        </div>
        <div className="shrink-0 text-right">
          {!resolved ? (
            <Badge tone="muted">not resolved yet</Badge>
          ) : resolved.ok ? (
            <Badge tone="brand">ok</Badge>
          ) : (
            <Badge tone="muted">error</Badge>
          )}
          {resolvedAt ? (
            <div className="mt-1 text-xs text-muted-foreground">resolved {relativeTime(resolvedAt, now)}</div>
          ) : null}
        </div>
      </div>

      {resolved && !resolved.ok ? (
        <p className="mt-3 text-sm text-[hsl(var(--destructive))]">{resolved.error}</p>
      ) : null}

      {resolved?.ok ? (
        resolved.files.length ? (
          <DataTable className="mt-4">
            <THead>
              <tr>
                <TH>File</TH>
                <TH>Description</TH>
                <TH>Applies to</TH>
                <TH className="w-[100px]">Size</TH>
              </tr>
            </THead>
            <tbody>
              {resolved.files.map((file) => (
                <TR key={file.path}>
                  <TD>
                    <span className="truncate font-mono text-[13px]">{file.path}</span>
                  </TD>
                  <TD className="text-muted-foreground">{file.description ?? "—"}</TD>
                  <TD>
                    <div className="flex flex-wrap gap-1.5">
                      {file.repos.length === 0 && file.clusters.length === 0 && file.globs.length === 0 ? (
                        <Badge tone="outline">All repositories</Badge>
                      ) : (
                        <>
                          {file.repos.map((r) => (
                            <Badge key={`r-${r}`} tone="outline">
                              {r}
                            </Badge>
                          ))}
                          {file.clusters.map((c) => (
                            <Badge key={`c-${c}`} tone="outline">
                              {c}
                            </Badge>
                          ))}
                          {file.globs.map((g) => (
                            <Badge key={`g-${g}`} tone="outline">
                              {g}
                            </Badge>
                          ))}
                        </>
                      )}
                      {file.truncated ? <Badge tone="muted">truncated</Badge> : null}
                    </div>
                    {file.warning ? (
                      <div className="mt-1 text-xs text-muted-foreground">{file.warning}</div>
                    ) : null}
                  </TD>
                  <TD className="text-muted-foreground">{plural(file.chars, "char")}</TD>
                </TR>
              ))}
            </tbody>
          </DataTable>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">This source has no markdown files.</p>
        )
      ) : null}
    </Card>
  );
}
