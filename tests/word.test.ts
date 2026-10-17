import { afterEach, describe, expect, it, vi } from "vitest";
import { sentenceAround } from "../src/api";
import worker from "../worker/src/index";

const env = { ANTHROPIC_API_KEY: "sk-test", ACCESS_CODE: "geheim", ALLOWED_ORIGINS: "http://localhost:5173" };
afterEach(() => vi.unstubAllGlobals());

describe("sentenceAround", () => {
  const text = "Oh, Wir sind Helden! Die mag ich auch. Welches Lied gefällt dir am besten?";
  it("returns only the sentence containing the word", () => {
    expect(sentenceAround(text, text.indexOf("gefällt"))).toBe("Welches Lied gefällt dir am besten?");
    expect(sentenceAround(text, text.indexOf("mag"))).toBe("Die mag ich auch.");
    expect(sentenceAround(text, 0)).toBe("Oh, Wir sind Helden!");
  });
  it("handles text with no full stop", () => {
    expect(sentenceAround("Na klar", 3)).toBe("Na klar");
  });
});

describe("/word", () => {
  const req = (body: unknown, code = "geheim") =>
    new Request("https://api.example/word", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Access-Code": code },
      body: JSON.stringify(body),
    });

  it("needs the access code", async () => {
    expect((await worker.fetch(req({ word: "Lied" }, "x"), env)).status).toBe(401);
  });

  it("returns the meaning in context", async () => {
    const fake = vi.fn(async () =>
      new Response(
        JSON.stringify({
          content: [
            {
              type: "tool_use",
              name: "word_info",
              input: { meaning: "pleases → which song do you like", lemma: "gefallen", pos: "verb", note: "dir is dative: it pleases you." },
            },
          ],
          usage: { input_tokens: 300, output_tokens: 40 },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fake);
    const res = await worker.fetch(req({ word: "gefällt", sentence: "Welches Lied gefällt dir am besten?" }), env);
    const body: any = await res.json();
    expect(body).toMatchObject({ word: "gefällt", lemma: "gefallen", pos: "verb", meaning: "pleases → which song do you like" });
    const sent = JSON.parse((fake.mock.calls[0] as any)[1].body);
    expect(sent.messages[0].content).toContain("Sentence: Welches Lied gefällt dir am besten?");
    expect(sent.max_tokens).toBe(300);
  });

  it("rejects an empty word", async () => {
    expect((await worker.fetch(req({ word: "  " }), env)).status).toBe(400);
  });
});
