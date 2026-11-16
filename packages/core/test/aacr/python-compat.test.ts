import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { PythonRandom, pyRound } from "../../src/aacr/python-compat.js";

/** Expected values were printed by CPython 3 (`random.Random(seed).shuffle`, `round`). */
describe("PythonRandom", () => {
  const firstTwelve: Record<number, number[]> = {
    0: [27, 67, 54, 73, 71, 14, 46, 136, 142, 29, 106, 121],
    1: [116, 57, 103, 144, 40, 21, 78, 129, 130, 121, 9, 108],
    42: [65, 134, 98, 117, 67, 38, 18, 30, 111, 101, 69, 88],
    123456789: [134, 121, 58, 18, 124, 27, 23, 49, 73, 146, 127, 30],
    [2 ** 40 + 7]: [108, 29, 136, 15, 145, 80, 30, 22, 26, 84, 137, 147],
  };
  for (const [seed, expected] of Object.entries(firstTwelve)) {
    it(`shuffles range(151) like CPython for seed ${seed}`, () => {
      const xs = Array.from({ length: 151 }, (_, i) => i);
      new PythonRandom(Number(seed)).shuffle(xs);
      expect(xs.slice(0, 12)).toEqual(expected);
    });
  }

  it("is a permutation for any seed and length", () => {
    fc.assert(
      fc.property(fc.nat({ max: 2 ** 31 }), fc.nat({ max: 300 }), (seed, n) => {
        const xs = Array.from({ length: n }, (_, i) => i);
        new PythonRandom(seed).shuffle(xs);
        expect([...xs].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i));
      }),
    );
  });

  it("treats a negative seed as its absolute value, as CPython does", () => {
    const a = Array.from({ length: 50 }, (_, i) => i);
    const b = [...a];
    new PythonRandom(-42).shuffle(a);
    new PythonRandom(42).shuffle(b);
    expect(a).toEqual(b);
  });
});

describe("pyRound", () => {
  it.each([
    [0.0625, 3, 0.062],
    [0.1875, 3, 0.188],
    [0.3125, 3, 0.312],
    [0.0125, 3, 0.013],
    [1 / 3, 3, 0.333],
    [2 / 3, 3, 0.667],
    [0.125, 2, 0.12],
    [0.375, 2, 0.38],
    [1.005, 2, 1],
    [2.675, 2, 2.67],
    [12.345, 2, 12.35],
    [7.125, 2, 7.12],
    [0.5, 0, 0],
    [1.5, 0, 2],
    [2.5, 0, 2],
    [1000.5, 0, 1000],
    [-2.5, 0, -2],
  ])("round(%s, %s) == %s", (x, nd, want) => {
    expect(pyRound(x, nd)).toBe(want);
  });

  it("agrees with toFixed everywhere except exact ties", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000 }), fc.integer({ min: 1, max: 10_000 }), (a, b) => {
        const x = a / b;
        const tie = Number.isInteger(x * 16) && (x * 16) % 2 === 1;
        if (!tie) expect(pyRound(x, 3)).toBe(Number(x.toFixed(3)));
      }),
    );
  });
});
