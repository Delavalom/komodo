/**
 * Who a login resolves to.
 *
 * The interesting cases are all the ways a login can be wrong — missing,
 * stale, differently cased — because each of them used to be the same case:
 * everyone was `team.you`, and the ledger recorded one name for a whole team.
 */
import { describe, expect, it } from "vitest";

import { pickActor } from "../src/actor.js";
import type { Member } from "../src/types.js";

const member = (login: string, isYou = false): Member => ({
  id: `member_${login}`,
  email: `${login}@acme.com`,
  name: login,
  githubLogin: login,
  role: "member",
  avatarSeed: login,
  isYou,
});

const ROSTER = [member("kai"), member("marco"), member("renata", true)];

describe("pickActor", () => {
  it("resolves a login to its member", () => {
    expect(pickActor(ROSTER, "marco")?.githubLogin).toBe("marco");
  });

  it("matches regardless of case", () => {
    // GitHub logins are case-insensitive, and one typed by hand will not
    // match one copied out of the API.
    expect(pickActor(ROSTER, "MARCO")?.githubLogin).toBe("marco");
  });

  it("ignores surrounding whitespace", () => {
    expect(pickActor(ROSTER, "  marco  ")?.githubLogin).toBe("marco");
  });

  it("falls back to team.you when nothing is chosen", () => {
    // A fresh browser must behave exactly as the deployment did before the
    // picker existed, and a one-person install must never have to choose.
    expect(pickActor(ROSTER, undefined)?.githubLogin).toBe("renata");
    expect(pickActor(ROSTER, "")?.githubLogin).toBe("renata");
    expect(pickActor(ROSTER, "   ")?.githubLogin).toBe("renata");
  });

  it("falls back rather than trusting an unknown login", () => {
    // A login that left the roster would otherwise put a name in the ledger
    // matching no member and no pull request author.
    expect(pickActor(ROSTER, "someone-else")?.githubLogin).toBe("renata");
  });

  it("takes the first member when the roster marks nobody", () => {
    const unmarked = [member("kai"), member("marco")];
    expect(pickActor(unmarked, undefined)?.githubLogin).toBe("kai");
  });

  it("reports nobody for an empty roster rather than throwing", () => {
    expect(pickActor([], "marco")).toBeNull();
  });
});
