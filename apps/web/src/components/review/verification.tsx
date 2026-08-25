"use client";

/**
 * The result-verification workspace.
 *
 * The AI can propose what has to be observed, but only a person records what
 * actually happened. Each submission appends to the ledger; a later result can
 * supersede the current state without erasing the failed or blocked attempt.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/controls";
import { Badge, StatusPill } from "@/components/ui/display";
import { Input, Textarea } from "@/components/ui/input";
import { useRecordVerification } from "@/lib/data/mutations";
import { relativeTime } from "@/lib/utils";
import { useNow } from "@/lib/data/provider";
import type {
  EvidenceKind,
  VerificationEntry,
  VerificationRequirement,
  VerificationResult,
} from "@/lib/types";

const RESULT_OPTIONS: readonly { value: VerificationResult; label: string }[] = [
  { value: "verified", label: "Observed as expected" },
  { value: "failed", label: "Did not work as expected" },
  { value: "blocked", label: "Could not verify" },
  { value: "not_applicable", label: "Not applicable" },
];

const EVIDENCE_LABEL: Record<EvidenceKind, string> = {
  preview: "Preview environment",
  screenshot: "Screenshot",
  video: "Video",
  test_run: "Test run",
  command_output: "Command output",
  manual_observation: "Manual observation",
};

const RESULT_LABEL: Record<VerificationResult, string> = {
  verified: "Verified",
  failed: "Failed",
  blocked: "Blocked",
  not_applicable: "Not applicable",
};

export function VerificationReview({
  requirements,
  verifications,
}: {
  requirements: VerificationRequirement[];
  verifications: VerificationEntry[];
}) {
  const current = new Map(
    verifications.map((entry) => [entry.requirementId, entry]),
  );
  const required = requirements.filter((check) => check.required);
  const verified = required.filter(
    (check) => current.get(check.id)?.result === "verified",
  ).length;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[820px] px-6 py-8">
        <h1 className="text-[22px] leading-snug">Verify the result</h1>
        <p className="mt-3 max-w-[700px] text-[15px] leading-relaxed text-muted-foreground">
          Run the changed behavior, inspect its real output, and record what you
          observed. The AI brief is preparation, not proof that the change works.
        </p>

        {requirements.length ? (
          <>
            <p className="mt-5 text-sm text-muted-foreground">
              {verified} of {required.length} required checks verified
            </p>
            <div className="mt-4 flex flex-col gap-4">
              {requirements.map((requirement) => (
                <VerificationCard
                  key={requirement.id}
                  requirement={requirement}
                  current={current.get(requirement.id) ?? null}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="mt-6 border border-border px-4 py-4">
            <p className="text-sm">No verification plan was recorded for this run.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Open the pull request and verify the changed behavior directly.
              This empty plan is not evidence and is not approval.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function VerificationCard({
  requirement,
  current,
}: {
  requirement: VerificationRequirement;
  current: VerificationEntry | null;
}) {
  const router = useRouter();
  const now = useNow();
  const record = useRecordVerification();
  const [result, setResult] = useState<VerificationResult>(
    current?.result ?? "blocked",
  );
  const [evidenceKind, setEvidenceKind] = useState<EvidenceKind>(
    requirement.evidenceKinds[0] ?? "manual_observation",
  );
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      try {
        await record({
          requirementId: requirement.id,
          result,
          evidenceKind,
          evidenceUrl,
          note,
        });
        setEvidenceUrl("");
        setNote("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  return (
    <section className="border border-border">
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[16px]">{requirement.title}</h2>
            {requirement.required ? (
              <Badge tone="outline">Required</Badge>
            ) : (
              <Badge tone="muted">Optional</Badge>
            )}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {requirement.instruction}
          </p>
          <p className="mt-2 text-sm">
            <span className="text-muted-foreground">Expected: </span>
            {requirement.expectedResult}
          </p>
        </div>
        <ResultStatus result={current?.result ?? null} />
      </div>

      {current ? (
        <div className="border-t border-border bg-muted-accent/30 px-4 py-2 text-xs text-muted-foreground">
          Current result recorded by {current.actorLogin} {relativeTime(current.createdAt, now)}
          {current.note ? `: ${current.note}` : "."}
          {current.evidenceUrl ? (
            <>
              {" "}
              <a
                href={current.evidenceUrl}
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-foreground"
              >
                Open evidence
              </a>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 border-t border-border px-4 py-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Result
          <Select
            value={result}
            options={RESULT_OPTIONS}
            onChange={setResult}
            align="start"
            className="w-full"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Evidence
          <Select
            value={evidenceKind}
            options={requirement.evidenceKinds.map((kind) => ({
              value: kind,
              label: EVIDENCE_LABEL[kind],
            }))}
            onChange={setEvidenceKind}
            align="start"
            className="w-full"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
          Evidence link
          <Input
            type="url"
            value={evidenceUrl}
            onChange={(event) => setEvidenceUrl(event.target.value)}
            placeholder="https://preview.example.com, screenshot, video, or test run"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
          What you observed
          <Textarea
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Describe the actual result, including environment and any limitation."
          />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button variant="brand" disabled={pending} onClick={submit}>
            {pending ? "Recording…" : current ? "Record a new result" : "Record result"}
          </Button>
          <span className="text-xs text-muted-foreground">
            Previous entries remain in the audit history.
          </span>
        </div>
        {error ? (
          <p className="text-sm text-[hsl(var(--destructive))] sm:col-span-2">{error}</p>
        ) : null}
      </div>
    </section>
  );
}

function ResultStatus({ result }: { result: VerificationResult | null }) {
  if (!result) return <StatusPill>Waiting</StatusPill>;
  const tone =
    result === "verified"
      ? "success"
      : result === "failed"
        ? "error"
        : result === "blocked"
          ? "warn"
          : "default";
  return <StatusPill tone={tone}>{RESULT_LABEL[result]}</StatusPill>;
}
