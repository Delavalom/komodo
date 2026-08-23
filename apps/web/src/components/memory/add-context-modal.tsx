"use client";

import * as React from "react";
import { Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/display";
import { Segmented, Select } from "@/components/ui/controls";
import { fullName, useRepositories } from "@/lib/data/queries";
import { useCreateMemoryRule } from "@/lib/data/mutations";

const RULE_PLACEHOLDER = `What: Using logging instead of printing log messages

Why: We can't filter log messages

Good: logging.error("error message")`;

function StepBadge({ n }: { n: number }) {
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-[2px] bg-secondary text-xs text-muted-foreground">
      {n}
    </span>
  );
}

function StepRow({
  n,
  title,
  control,
}: {
  n: number;
  title: string;
  control?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2.5">
        <StepBadge n={n} />
        <span className="text-[15px] font-medium">{title}</span>
      </div>
      {control}
    </div>
  );
}

export function AddContextModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const repos = useRepositories();
  const createRule = useCreateMemoryRule();

  const [kind, setKind] = React.useState<"rule" | "file">("rule");
  const [ruleText, setRuleText] = React.useState("");
  const [filePath, setFilePath] = React.useState("");
  const [fileRepo, setFileRepo] = React.useState("");
  const [fileDescription, setFileDescription] = React.useState("");
  const [scopeRepo, setScopeRepo] = React.useState("");
  const [scopePattern, setScopePattern] = React.useState("");

  const repoOptions = repos.map((r) => ({ value: r.id, label: fullName(r) }));
  const canCreate =
    kind === "rule" ? ruleText.trim().length > 0 : filePath.trim().length > 0;

  function reset() {
    setRuleText("");
    setFilePath("");
    setFileRepo("");
    setFileDescription("");
    setScopeRepo("");
    setScopePattern("");
  }

  function submit() {
    if (!canCreate) return;
    createRule({
      description:
        kind === "rule"
          ? (ruleText.split("\n")[0].replace(/^What:\s*/i, "").trim() ||
            "Custom rule")
          : (fileDescription.trim() || filePath.trim()),
      kind,
      pattern: kind === "rule" ? ruleText.trim() : filePath.trim(),
      repoId: (kind === "file" ? fileRepo : scopeRepo) || null,
      fileGlob: scopePattern.trim(),
    });
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={500}
      title="Add Context"
      subtitle="Define rules and files for Komodo to read alongside the diff."
      footer={
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={onClose} className="w-full">
            Cancel
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            disabled={!canCreate}
            onClick={submit}
          >
            <Wand2 className="h-3.5 w-3.5" />
            Create Context
          </Button>
        </div>
      }
    >
      <div className="divide-y divide-border">
        <div className="p-5">
          <StepRow
            n={1}
            title="Choose a context type"
            control={
              <Segmented
                value={kind}
                onChange={setKind}
                options={[
                  { value: "rule" as const, label: "Rule" },
                  { value: "file" as const, label: "File" },
                ]}
              />
            }
          />
        </div>

        <div className="space-y-4 p-5">
          <StepRow
            n={2}
            title={kind === "rule" ? "Describe your rule" : "Add your file"}
          />
          {kind === "rule" ? (
            <Textarea
              rows={5}
              value={ruleText}
              onChange={(event) => setRuleText(event.target.value)}
              placeholder={RULE_PLACEHOLDER}
              className="bg-secondary"
            />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Repository">
                  <Select
                    value={fileRepo}
                    onChange={setFileRepo}
                    options={repoOptions}
                    placeholder="Select a repository"
                    size="md"
                    align="start"
                    className="w-full"
                    panelClassName="max-h-[240px] overflow-y-auto"
                  />
                </Field>
                <Field label="File Path">
                  <Input
                    value={filePath}
                    onChange={(event) => setFilePath(event.target.value)}
                    placeholder="e.g. docs/guidelines.md or docs/"
                  />
                </Field>
              </div>
              <Field
                label={
                  <>
                    File Description{" "}
                    <span className="text-muted-foreground">(optional)</span>
                  </>
                }
              >
                <Input
                  value={fileDescription}
                  onChange={(event) => setFileDescription(event.target.value)}
                  placeholder="e.g. Database migration scripts for user auth tables"
                />
              </Field>
            </div>
          )}
        </div>

        <div className="space-y-4 p-5">
          {/* One scope per rule — a repository (or cluster) and a glob — so
              there is nothing for an "Add" button to add. It used to be here
              and did nothing. */}
          <StepRow n={3} title={`Scope: Where should this ${kind} apply?`} />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Repository">
              <Select
                value={scopeRepo}
                onChange={setScopeRepo}
                options={[
                  { value: "", label: "All repositories" },
                  ...repoOptions,
                ]}
                placeholder="All repositories"
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
                  value={scopePattern}
                  onChange={(event) => setScopePattern(event.target.value)}
                  placeholder="e.g. src/**/*.tsx"
                  className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </div>
            </Field>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function Field({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
