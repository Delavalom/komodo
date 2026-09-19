import { describe, expect, it } from "vitest";
import { renderDiagram } from "../src/render.js";
import { labelMask, pathIsOrthogonal } from "../src/geometry.js";
import { erFixture, flowchartFixture, sequenceFixture, stateFixture } from "./fixtures.js";

const FIXTURES = [
  ["sequence", sequenceFixture],
  ["flowchart", flowchartFixture],
  ["state", stateFixture],
  ["er", erFixture],
] as const;

function extractPathDs(svg: string): string[] {
  const matches = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)];
  return matches.map((m) => m[1]);
}

describe.each(FIXTURES)("renderDiagram — %s — accessible-SVG contract", (_type, spec) => {
  const svg = renderDiagram(spec, "diag-1");

  it("has role=img and aria-labelledby resolving to a title and desc id", () => {
    expect(svg).toMatch(/<svg[^>]*role="img"/);
    const ariaMatch = svg.match(/aria-labelledby="([^"]+)"/);
    expect(ariaMatch).not.toBeNull();
    const [titleId, descId] = ariaMatch![1].split(" ");
    expect(svg).toContain(`<title id="${titleId}">`);
    expect(svg).toContain(`<desc id="${descId}">`);
  });

  it("never uses a bare title/desc id", () => {
    expect(svg).not.toMatch(/id="title"/);
    expect(svg).not.toMatch(/id="desc"/);
  });

  it("places <title> before <defs>", () => {
    expect(svg.indexOf("<title")).toBeLessThan(svg.indexOf("<defs>"));
    expect(svg.indexOf("<title")).toBeGreaterThan(-1);
  });

  it("has a non-empty <desc>", () => {
    const descMatch = svg.match(/<desc id="[^"]+">([^<]*)<\/desc>/);
    expect(descMatch?.[1].trim().length).toBeGreaterThan(0);
  });
});

describe.each(FIXTURES)("renderDiagram — %s — mandatory connector rule #1 (no diagonals)", (_type, spec) => {
  it("every path is orthogonal (straight segments axis-aligned; only Q bends allowed)", () => {
    const svg = renderDiagram(spec, "diag-2");
    const ds = extractPathDs(svg);
    expect(ds.length).toBeGreaterThan(0);
    for (const d of ds) expect(pathIsOrthogonal(d)).toBe(true);
  });
});

describe.each(FIXTURES)("renderDiagram — %s — single-file safety (self_check.py's contract)", (_type, spec) => {
  const svg = renderDiagram(spec, "diag-3");

  it("contains no <script> tags", () => {
    expect(svg.toLowerCase()).not.toContain("<script");
  });

  it("contains no executable event-handler attributes", () => {
    expect(svg).not.toMatch(/\son\w+\s*=/i);
  });

  it("contains no remote references (only inline markup)", () => {
    expect(svg).not.toMatch(/\s(?:href|src)="https?:/i);
  });
});

describe("renderDiagram — escaping (the one place spec text meets markup)", () => {
  it("escapes an actor name containing markup instead of concatenating it raw", () => {
    const spec = {
      ...sequenceFixture,
      actors: [
        { id: "client", name: '<script>alert(1)</script>' },
        { id: "api", name: "API" },
        { id: "auth", name: "Auth" },
      ],
    };
    const svg = renderDiagram(spec, "diag-4");
    expect(svg).not.toContain("<script>alert(1)</script>");
    expect(svg).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapes a message label containing an attribute breakout attempt", () => {
    const spec = {
      ...sequenceFixture,
      items: [
        {
          kind: "message" as const,
          message: {
            from: "client",
            to: "api",
            kind: "call" as const,
            label: '"><rect x="0" y="0" width="1" height="1" fill="red"/>',
            headline: false,
          },
        },
      ],
    };
    const svg = renderDiagram(spec, "diag-5");
    expect(svg).not.toContain('"><rect x="0" y="0" width="1" height="1" fill="red"/>');
  });
});

describe("renderDiagram — id isolation across multiple inline diagrams", () => {
  it("never reuses an id between two instances on the same page", () => {
    const a = renderDiagram(sequenceFixture, "review-42-a");
    const b = renderDiagram(sequenceFixture, "review-42-b");
    const idsOf = (svg: string) => [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    const overlap = idsOf(a).filter((id) => idsOf(b).includes(id));
    expect(overlap).toEqual([]);
  });
});

describe("labelMask — mandatory 6-10px gap above the connector stroke (rule #2)", () => {
  it("keeps the mask bottom at least 6px above the stroke y", () => {
    const mask = labelMask(100, 200, "WRITE");
    expect(200 - (mask.y + mask.height)).toBeGreaterThanOrEqual(6);
  });
});
