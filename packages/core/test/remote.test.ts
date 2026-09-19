/**
 * Where a review gets posted, and what will not be posted to.
 */
import { describe, expect, it } from "vitest";

import { normalizeHost } from "../src/remote.js";

describe("normalizing a deployment host", () => {
  it("keeps a path prefix, for a deployment behind a proxy", () => {
    // Dropping it would 404 every request against a Komodo served at /komodo.
    expect(normalizeHost("https://tools.acme.com/komodo/")).toBe(
      "https://tools.acme.com/komodo",
    );
  });

  it("drops a trailing slash so paths are appended once", () => {
    expect(normalizeHost("https://komodo.acme.com/")).toBe("https://komodo.acme.com");
  });

  it("assumes http for a bare localhost, which is how komodo dev prints it", () => {
    expect(normalizeHost("localhost:4400")).toBe("http://localhost:4400");
    expect(normalizeHost("127.0.0.1:4400")).toBe("http://127.0.0.1:4400");
  });

  it("refuses to send a key in clear text to anywhere but this machine", () => {
    // The person typing this has no way to see the credential go out
    // unencrypted, so the refusal has to be here.
    expect(() => normalizeHost("http://komodo.acme.com")).toThrow(/clear text/);
  });

  it("allows https to the same host", () => {
    expect(normalizeHost("https://komodo.acme.com")).toBe("https://komodo.acme.com");
  });

  it("rejects an empty host rather than defaulting to something", () => {
    expect(() => normalizeHost("   ")).toThrow(/cannot be empty/);
  });
});
