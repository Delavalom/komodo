import { describe, expect, it } from "vitest";

import {
  publishLatestVerificationStatus,
  verificationStatus,
  type VerificationStatusSource,
  type VerificationStatusSnapshot,
} from "../src/verification-status.js";

const failed: VerificationStatusSource = {
  requirements: [{ id: "check-1", required: true }],
  entries: [
    {
      id: "entry-1",
      requirementId: "check-1",
      result: "failed",
    },
  ],
};

const verified: VerificationStatusSource = {
  requirements: failed.requirements,
  entries: [
    {
      id: "entry-2",
      requirementId: "check-1",
      result: "verified",
    },
  ],
};

describe("verification status publication", () => {
  it("derives failure and success from the latest required evidence", () => {
    expect(verificationStatus(failed).state).toBe("failure");
    expect(verificationStatus(verified).state).toBe("success");
  });

  it("corrects a stale status that arrives after a concurrent update", async () => {
    let current = failed;
    let releaseOld!: () => void;
    let markOldStarted!: () => void;
    const oldStarted = new Promise<void>((resolve) => {
      markOldStarted = resolve;
    });
    const waitToPublishOld = new Promise<void>((resolve) => {
      releaseOld = resolve;
    });
    const published: VerificationStatusSnapshot[] = [];
    let heldOld = false;
    const publish = async (status: VerificationStatusSnapshot) => {
      if (status.state === "failure" && !heldOld) {
        heldOld = true;
        markOldStarted();
        await waitToPublishOld;
      }
      published.push(status);
    };

    const slow = publishLatestVerificationStatus(
      async () => current,
      publish,
    );
    await oldStarted;
    current = verified;
    await publishLatestVerificationStatus(async () => current, publish);
    releaseOld();
    await slow;

    expect(published.map((status) => status.state)).toEqual([
      "success",
      "failure",
      "success",
    ]);
  });
});
