import { describe, expect, it } from "vitest";
import { specToMermaid } from "../src/mermaid.js";
import { erFixture, flowchartFixture, sequenceFixture, stateFixture } from "./fixtures.js";

describe("specToMermaid", () => {
  it("emits a sequenceDiagram with participants and an alt/else fragment", () => {
    const out = specToMermaid(sequenceFixture);
    expect(out).toMatch(/^sequenceDiagram/);
    expect(out).toContain("participant client as Client");
    expect(out).toContain("alt token valid");
    expect(out).toContain("else token expired");
    expect(out).toContain("end");
  });

  it("emits a flowchart with shape-coded nodes", () => {
    const out = specToMermaid(flowchartFixture);
    expect(out).toMatch(/^flowchart TD/);
    expect(out).toContain('start(["Start"])');
    expect(out).toContain('check{"Cart valid?"}');
    expect(out).toMatch(/check -->\|yes\| charge/);
  });

  it("emits a stateDiagram-v2 with initial/final markers", () => {
    const out = specToMermaid(stateFixture);
    expect(out).toMatch(/^stateDiagram-v2/);
    expect(out).toContain("[*] --> pending");
    expect(out).toContain("settled --> [*]");
  });

  it("emits an erDiagram with fields and a cardinality operator", () => {
    const out = specToMermaid(erFixture);
    expect(out).toMatch(/^erDiagram/);
    expect(out).toContain("customer {");
    expect(out).toContain("uuid id PK");
    expect(out).toMatch(/customer \|\|--o\{ order/);
  });
});
