import { describe, expect, it } from "vitest";
import { joinTranscript } from "../src/listen";

describe("joinTranscript", () => {
  it("joins confirmed phrases and the phrase still being heard", () => {
    expect(joinTranscript(["Ich habe gestern"], "einen Film gesehen")).toBe("Ich habe gestern einen Film gesehen");
  });
  it("tidies spaces before punctuation", () => {
    expect(joinTranscript(["Ja ,", "das stimmt ."], "")).toBe("Ja, das stimmt.");
  });
  it("is empty when nothing was heard", () => {
    expect(joinTranscript([], "  ")).toBe("");
  });
});
