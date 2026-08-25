type VerificationResult = "verified" | "failed" | "blocked" | "not_applicable";

export interface VerificationStatusSource {
  requirements: ReadonlyArray<{ id: string; required: boolean }>;
  entries: ReadonlyArray<{
    id: string;
    requirementId: string;
    result: VerificationResult;
  }>;
}

export interface VerificationStatusSnapshot {
  version: string;
  state: "pending" | "success" | "failure";
  description: string;
}

/** Derives the GitHub status from the latest evidence for required checks. */
export function verificationStatus(
  source: VerificationStatusSource,
): VerificationStatusSnapshot {
  const latest = new Map(
    source.entries.map((entry) => [entry.requirementId, entry]),
  );
  const required = source.requirements.filter((check) => check.required);
  const entries = required.map((check) => latest.get(check.id) ?? null);
  const results = entries.map((entry) => entry?.result ?? null);
  const state = results.includes("failed")
    ? "failure"
    : results.includes("blocked") || results.some((result) => result !== "verified")
      ? "pending"
      : "success";

  return {
    version: JSON.stringify(
      required.map((check, index) => [
        check.id,
        entries[index]?.id ?? null,
        results[index],
      ]),
    ),
    state,
    description:
      state === "success"
        ? "Human evidence recorded; GitHub approval remains separate"
        : state === "failure"
          ? "A required result check failed"
          : "Human verification is still required",
  };
}

/**
 * Publishes until the posted status matches a stable store snapshot.
 *
 * A slower request can otherwise publish an older status after a newer one.
 * Reading again after every post detects that race and corrects the remote
 * status once concurrent evidence writes stop.
 */
export async function publishLatestVerificationStatus(
  load: () => Promise<VerificationStatusSource | null>,
  publish: (status: VerificationStatusSnapshot) => Promise<void>,
): Promise<void> {
  for (;;) {
    const source = await load();
    if (!source) return;
    const posted = verificationStatus(source);
    await publish(posted);

    const currentSource = await load();
    if (!currentSource) return;
    if (verificationStatus(currentSource).version === posted.version) return;
  }
}
