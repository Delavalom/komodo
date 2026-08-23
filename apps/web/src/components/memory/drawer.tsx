"use client";

import * as React from "react";
import {
  Clock,
  FileCode2,
  Pencil,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  TrendingUp,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Drawer } from "@/components/ui/display";
import { Segmented, Select } from "@/components/ui/controls";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/memory/add-context-modal";
import { fullName, useRepositories } from "@/lib/data/queries";
import { useDeleteMemoryRule, useUpdateMemoryRule } from "@/lib/data/mutations";
import { percent, plural } from "@/lib/utils";
import type { MemoryRuleStats } from "@/lib/types";

export function MemoryDrawer({
  rule,
  mode,
  onModeChange,
  onClose,
}: {
  rule: MemoryRuleStats;
  mode: "analytics" | "edit";
  onModeChange: (next: "analytics" | "edit") => void;
  onClose: () => void;
}) {
  return mode === "analytics" ? (
    <AnalyticsMode rule={rule} onEdit={() => onModeChange("edit")} onClose={onClose} />
  ) : (
    <EditMode rule={rule} onCancel={() => onModeChange("analytics")} onClose={onClose} />
  );
}

function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="text-lg font-medium">{children}</h3>
      {action}
    </div>
  );
}

function AnalyticsMode({
  rule,
  onEdit,
  onClose,
}: {
  rule: MemoryRuleStats;
  onEdit: () => void;
  onClose: () => void;
}) {
  const total = rule.upvotes + rule.downvotes;
  const upRatio = total ? (rule.upvotes / total) * 100 : 0;
  const downRatio = total ? (rule.downvotes / total) * 100 : 0;

  return (
    <Drawer open title="Analytics" onClose={onClose}>
      <SectionTitle
        action={
          <Button size="sm" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        }
      >
        Overview
      </SectionTitle>
      <Field label="File Description">
        <div className="rounded-[2px] border border-border bg-secondary px-3 py-2 text-sm">
          {rule.description}
        </div>
      </Field>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm font-medium">Type</span>
        <span className="flex items-center gap-2 text-sm">
          <FileCode2 className="h-4 w-4 text-[hsl(var(--chart-2))]" />
          {rule.kind === "file" ? "Pattern" : "Rule"}
        </span>
      </div>

      <div className="mt-7">
        <SectionTitle>Performance</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            label="Acceptance rate"
            value={percent(rule.acceptanceRate ?? 0)}
          />
          <StatCard
            icon={<Clock className="h-3.5 w-3.5" />}
            label="Uses this month"
            value={String(rule.usesThisMonth)}
          />
          <StatCard
            icon={<ThumbsUp className="h-3.5 w-3.5" />}
            label="Upvote ratio"
            value={percent(upRatio)}
            tone="success"
          />
          <StatCard
            icon={<ThumbsDown className="h-3.5 w-3.5" />}
            label="Downvote ratio"
            value={percent(downRatio)}
            tone="error"
          />
        </div>
      </div>

      <div className="mt-7">
        <SectionTitle>Recent Usage</SectionTitle>
        {rule.usageCount === 0 ? (
          <div className="flex h-[88px] items-center justify-center rounded-[2px] border border-dashed border-border text-sm text-muted-foreground">
            No recent usage available
          </div>
        ) : (
          <Card className="p-4 text-sm text-muted-foreground">
            Applied {plural(rule.usesThisMonth, "time")} this month across{" "}
            {plural(rule.files.length || 1, "file")}.
          </Card>
        )}
      </div>

      <div className="mt-7 pb-4">
        <SectionTitle>
          <span className="flex items-center gap-2">
            Files
            <span className="rounded-[2px] bg-secondary px-1.5 text-[11px] text-muted-foreground">
              {rule.files.length}
            </span>
          </span>
        </SectionTitle>
        {rule.files.length === 0 ? (
          <div className="flex h-[64px] items-center justify-center rounded-[2px] border border-dashed border-border px-4 text-center text-sm text-muted-foreground">
            {rule.kind === "file"
              ? "No files matched yet. They appear once a review reads them out of a repository."
              : "This rule carries its own text — it matches no files."}
          </div>
        ) : (
          <ul className="space-y-2">
            {rule.files.map((file) => (
              <li
                key={file.path}
                className="rounded-[2px] border border-border p-3"
              >
                <div className="truncate text-sm">{file.path}</div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  Read in {plural(file.uses, "review")}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "success" | "error";
}) {
  const color =
    tone === "success"
      ? "text-[hsl(var(--success))]"
      : tone === "error"
        ? "text-[hsl(var(--error))]"
        : "";
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={`mt-1.5 text-xl font-semibold ${color}`}>{value}</div>
    </Card>
  );
}

function EditMode({
  rule,
  onCancel,
  onClose,
}: {
  rule: MemoryRuleStats;
  onCancel: () => void;
  onClose: () => void;
}) {
  const repos = useRepositories();
  const update = useUpdateMemoryRule();
  const remove = useDeleteMemoryRule();

  const [description, setDescription] = React.useState(rule.description);
  const [status, setStatus] = React.useState(rule.status);
  const [pattern, setPattern] = React.useState(rule.pattern);
  const [scopeRepo, setScopeRepo] = React.useState(rule.repoId ?? "");
  const [fileGlob, setFileGlob] = React.useState(rule.fileGlob);

  return (
    <Drawer
      open
      title="Edit"
      onClose={onClose}
      footer={
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            aria-label="Delete rule"
            onClick={() => {
              remove(rule.id);
              onClose();
            }}
            className="h-9 w-9 p-0 text-[hsl(var(--destructive))]"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <div className="ml-auto flex gap-3">
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                update(rule.id, {
                  description,
                  status,
                  pattern,
                  repoId: scopeRepo || null,
                  fileGlob,
                });
                onCancel();
              }}
            >
              Save
            </Button>
          </div>
        </div>
      }
    >
      <SectionTitle>Overview</SectionTitle>
      <Field label="File Description">
        <Textarea
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="bg-secondary"
        />
      </Field>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm font-medium">Type</span>
        <span className="flex items-center gap-2 text-sm">
          <FileCode2 className="h-4 w-4 text-[hsl(var(--chart-2))]" />
          {rule.kind === "file" ? "Pattern" : "Rule"}
        </span>
      </div>

      <div className="mt-7">
        {/* A rule carries one repository scope and one glob; there was an Add
            button here for a second one the store cannot hold. */}
        <SectionTitle>Scope</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Repository">
            <Select
              value={scopeRepo}
              onChange={setScopeRepo}
              options={[
                { value: "", label: "All repositories" },
                ...repos.map((r) => ({ value: r.id, label: fullName(r) })),
              ]}
              size="md"
              align="start"
              className="w-full"
              panelClassName="max-h-[240px] overflow-y-auto"
            />
          </Field>
          <Field label="File pattern">
            <div className="flex h-9 items-center gap-2 rounded-[2px] border border-border bg-card px-2">
              <span className="rounded-[2px] bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                auto
              </span>
              <input
                value={fileGlob}
                onChange={(event) => setFileGlob(event.target.value)}
                placeholder="e.g. src/**/*.tsx"
                className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </div>
          </Field>
        </div>
      </div>

      <div className="mt-7 flex items-center justify-between">
        <h3 className="text-lg font-medium">Status</h3>
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: "active" as const, label: "Active" },
            { value: "inactive" as const, label: "Inactive" },
          ]}
        />
      </div>

      <div className="mt-7 pb-4">
        <SectionTitle>Pattern</SectionTitle>
        <Input
          value={pattern}
          onChange={(event) => setPattern(event.target.value)}
          className="bg-secondary font-mono text-[13px]"
        />
      </div>
    </Drawer>
  );
}
