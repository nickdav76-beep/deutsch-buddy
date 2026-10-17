import { describe, expect, it } from "vitest";
import { VISEME_SHAPES, visemeAt } from "../src/avatar";

describe("viseme shapes", () => {
  it("covers all 22 Azure visemes with sensible values", () => {
    expect(VISEME_SHAPES).toHaveLength(22);
    for (const [open, wide] of VISEME_SHAPES) {
      expect(open).toBeGreaterThanOrEqual(0);
      expect(open).toBeLessThanOrEqual(1);
      expect(Math.abs(wide)).toBeLessThanOrEqual(1);
    }
  });
  it("keeps the mouth closed for silence and p/b/m, open wide for 'a'", () => {
    expect(VISEME_SHAPES[0][0]).toBe(0);
    expect(VISEME_SHAPES[21][0]).toBe(0);
    expect(VISEME_SHAPES[2][0]).toBeGreaterThan(0.8);
  });
  it("rounds the lips for 'u' and spreads them for 'i'", () => {
    expect(VISEME_SHAPES[7][1]).toBeLessThan(-0.5);
    expect(VISEME_SHAPES[6][1]).toBeGreaterThan(0.5);
  });
});

describe("visemeAt", () => {
  const v = [
    { t: 0, id: 0 },
    { t: 0.1, id: 21 },
    { t: 0.18, id: 2 },
    { t: 0.3, id: 7 },
  ];
  it("finds the shape in effect at each moment", () => {
    expect(visemeAt(v, 0.05)).toBe(0);
    expect(visemeAt(v, 0.12)).toBe(21);
    expect(visemeAt(v, 0.25)).toBe(2);
    expect(visemeAt(v, 2)).toBe(7);
  });
  it("is silent before anything starts or with no data", () => {
    expect(visemeAt([], 1)).toBe(0);
    expect(visemeAt([{ t: 0.5, id: 2 }], 0.1)).toBe(0);
  });
});
