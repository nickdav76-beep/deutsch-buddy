import { describe, expect, it } from "vitest";
import { sameIgnoringPunctuation, wordDiff } from "../src/diff";

describe("wordDiff", () => {
  it("marks a changed article", () => {
    expect(wordDiff("Ich habe ein Hund", "Ich habe einen Hund")).toEqual([
      { kind: "same", text: "Ich habe" },
      { kind: "del", text: "ein" },
      { kind: "ins", text: "einen" },
      { kind: "same", text: "Hund" },
    ]);
  });

  it("handles moved verbs (word order)", () => {
    const segs = wordDiff("Gestern ich bin gegangen", "Gestern bin ich gegangen");
    const rebuilt = segs.filter((s) => s.kind !== "del").map((s) => s.text).join(" ");
    expect(rebuilt).toBe("Gestern bin ich gegangen");
  });

  it("returns one same segment when nothing changed", () => {
    expect(wordDiff("Guten Morgen!", "Guten Morgen!")).toEqual([{ kind: "same", text: "Guten Morgen!" }]);
  });

  it("keeps capitalisation fixes visible (nouns are capitalised in German)", () => {
    expect(wordDiff("ich mag musik", "Ich mag Musik").some((s) => s.kind === "ins")).toBe(true);
  });
});

describe("sameIgnoringPunctuation", () => {
  it("ignores commas and full stops", () => {
    expect(sameIgnoringPunctuation("Ja das stimmt", "Ja, das stimmt.")).toBe(true);
  });
  it("still sees real changes", () => {
    expect(sameIgnoringPunctuation("Ich bin gegangen", "Ich gehe")).toBe(false);
  });
});
