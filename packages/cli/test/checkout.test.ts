/**
 * Whether a directory may take a claimed head.
 *
 * By the time this runs the job is already claimed and its lease is ticking,
 * so every refusal has to say what to fix and which command to run after.
 */
import { describe, expect, it } from "vitest";

import { checkoutRefusal } from "../src/checkout.js";

const claim = { repoId: "acme/api", claimPath: "/tmp/claim.json" };

describe("whether this checkout may take the claimed head", () => {
  it("allows a clean clone of the claimed repository", () => {
    expect(
      checkoutRefusal({ ...claim, origin: "git@github.com:acme/api.git", porcelain: "" }),
    ).toBeNull();
  });

  it("matches the repository without regard to case, as GitHub does", () => {
    expect(
      checkoutRefusal({ ...claim, origin: "https://github.com/Acme/API.git", porcelain: "" }),
    ).toBeNull();
  });

  it("refuses a clone of a different repository, and says where to go", () => {
    const refusal = checkoutRefusal({
      ...claim,
      origin: "https://github.com/acme/web.git",
      porcelain: "",
    });
    expect(refusal).toMatch(/acme\/api/);
    expect(refusal).toMatch(/acme\/web/);
    expect(refusal).toMatch(/komodo-review checkout \/tmp\/claim\.json/);
  });

  it("refuses a directory with no origin", () => {
    expect(checkoutRefusal({ ...claim, origin: null, porcelain: "" })).toMatch(/origin/);
  });

  it("refuses tracked changes, which would ride into the review", () => {
    expect(
      checkoutRefusal({
        ...claim,
        origin: "git@github.com:acme/api.git",
        porcelain: " M src/a.ts",
      }),
    ).toMatch(/uncommitted/);
  });
});
