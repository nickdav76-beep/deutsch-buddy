import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { cleanMessages, parseTutorOutput } from "../worker/src/index";
import { OPENER_INSTRUCTION } from "../worker/src/prompt";

const env = {
  ANTHROPIC_API_KEY: "sk-test",
  ACCESS_CODE: "geheim",
  ALLOWED_ORIGINS: "https://nickdav76-beep.github.io,http://localhost:5173",
};

const post = (body: unknown, code = "geheim") =>
  new Request("https://api.example/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Access-Code": code, Origin: "https://nickdav76-beep.github.io" },
    body: JSON.stringify(body),
  });

afterEach(() => vi.unstubAllGlobals());

describe("cleanMessages", () => {
  it("puts the opener back in front when history starts with Lena", () => {
    const out = cleanMessages([
      { role: "assistant", content: "Hallo!" },
      { role: "user", content: "Hallo Lena" },
    ])!;
    expect(out[0]).toEqual({ role: "user", content: OPENER_INSTRUCTION });
    expect(out).toHaveLength(3);
  });
  it("rejects bad roles", () => {
    expect(cleanMessages([{ role: "system", content: "x" }])).toBeNull();
  });
});

describe("parseTutorOutput", () => {
  it("reads the tool call", () => {
    const t = parseTutorOutput({ content: [{ type: "tool_use", name: "tutor_turn", input: { reply: "Super!" } }] });
    expect(t?.reply).toBe("Super!");
  });
  it("falls back to plain text", () => {
    const t = parseTutorOutput({ content: [{ type: "text", text: "Wie geht's?" }] });
    expect(t).toMatchObject({ reply: "Wie geht's?", corrections: [] });
  });
});

describe("worker", () => {
  it("refuses a wrong access code", async () => {
    const res = await worker.fetch(post({ messages: [] }, "falsch"), env);
    expect(res.status).toBe(401);
  });

  it("calls Claude and returns reply, corrections and usage", async () => {
    const fake = vi.fn(async () =>
      new Response(
        JSON.stringify({
          content: [
            {
              type: "tool_use",
              name: "tutor_turn",
              input: {
                reply: "Cool! Welchen Hund hast du?",
                translation: "Cool! Which dog do you have?",
                corrected_sentence: "Ich habe einen Hund.",
                corrections: [{ original: "ein Hund", corrected: "einen Hund", explanation: "haben takes the accusative.", type: "case" }],
              },
            },
          ],
          usage: { input_tokens: 900, output_tokens: 120, cache_read_input_tokens: 600 },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fake);

    const res = await worker.fetch(
      post({ level: "A2", scenario: "free", messages: [{ role: "user", content: "Ich habe ein Hund." }] }),
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://nickdav76-beep.github.io");
    const body: any = await res.json();
    expect(body.corrections[0].type).toBe("case");
    expect(body.usage).toEqual({ input: 900, output: 120, cached: 600 });

    const sent = JSON.parse((fake.mock.calls[0] as any)[1].body);
    expect(sent.model).toBe("claude-haiku-5-5");
    expect(sent.system[0].text).toContain("Learner level: A2");
    expect((fake.mock.calls[0] as any)[1].headers["x-api-key"]).toBe("sk-test");
  });
});
