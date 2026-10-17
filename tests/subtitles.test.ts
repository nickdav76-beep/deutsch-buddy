import { describe, expect, it } from "vitest";
import { activeWord, alignWords, buildSegments, wordAtChar, wordPositions } from "../src/subtitles";

const text = "Moin! Wie geht's dir heute?";
const raw = [
  { text: "Moin", offset: 0, start: 0.05, end: 0.4 },
  { text: "Wie", offset: 6, start: 0.7, end: 0.85 },
  { text: "geht's", offset: 10, start: 0.85, end: 1.1 },
  { text: "dir", offset: 17, start: 1.1, end: 1.25 },
  { text: "heute", offset: 21, start: 1.25, end: 1.6 },
];

describe("alignWords", () => {
  it("keeps correct offsets", () => {
    expect(alignWords(text, raw).map((w) => w.offset)).toEqual([0, 6, 10, 17, 21]);
  });
  it("repairs wrong offsets by searching forward", () => {
    const shifted = raw.map((w) => ({ ...w, offset: w.offset + 3 }));
    expect(alignWords(text, shifted).map((w) => w.offset)).toEqual([0, 6, 10, 17, 21]);
  });
  it("finds the second of two identical words", () => {
    const t = "Ja, ja, genau.";
    const out = alignWords(t, [
      { text: "Ja", offset: 0, start: 0, end: 0.2 },
      { text: "ja", offset: 99, start: 0.3, end: 0.5 },
      { text: "genau", offset: 8, start: 0.6, end: 1 },
    ]);
    expect(out.map((w) => w.offset)).toEqual([0, 4, 8]);
  });
  it("handles umlauts and ß", () => {
    const t = "Schöne Grüße aus Hamburg";
    const out = alignWords(t, [
      { text: "Schöne", offset: 0, start: 0, end: 0.3 },
      { text: "Grüße", offset: 7, start: 0.3, end: 0.6 },
    ]);
    expect(t.slice(out[1].offset, out[1].offset + out[1].length)).toBe("Grüße");
  });
});

describe("buildSegments", () => {
  it("rebuilds the exact text with words marked", () => {
    const segs = buildSegments(text, alignWords(text, raw));
    expect(segs.map((s) => s.text).join("")).toBe(text);
    expect(segs.filter((s) => s.word !== null).map((s) => s.text)).toEqual(["Moin", "Wie", "geht's", "dir", "heute"]);
  });
});

describe("activeWord", () => {
  const words = alignWords(text, raw);
  it("is -1 before speech starts", () => expect(activeWord(words, 0, 0)).toBe(-1));
  it("tracks the current word", () => {
    expect(activeWord(words, 0.2)).toBe(0);
    expect(activeWord(words, 0.9)).toBe(2);
    expect(activeWord(words, 5)).toBe(4);
  });
});

describe("device voice helpers", () => {
  it("finds words and maps character positions", () => {
    const pos = wordPositions(text);
    expect(pos.map((p) => text.slice(p.offset, p.offset + p.length))).toEqual(["Moin", "Wie", "geht's", "dir", "heute"]);
    expect(wordAtChar(pos, 11)).toBe(2);
  });
});
