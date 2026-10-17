import { LEVELS, Level, OPENER_INSTRUCTION, SPOKEN_NOTE, TUTOR_TOOL, WORD_PROMPT, WORD_TOOL, systemPrompt } from "./prompt";

export interface Env {
  ANTHROPIC_API_KEY: string;
  ACCESS_CODE: string; // shared secret the app sends, so strangers can't spend your credit
  ALLOWED_ORIGINS: string; // comma-separated, e.g. "https://nickdav76-beep.github.io,http://localhost:5173"
  MODEL?: string;
  AZURE_SPEECH_KEY?: string; // Azure Speech resource key (secret)
  AZURE_SPEECH_REGION?: string; // e.g. "australiaeast"
}

/** Swap the long-lived Azure key for a 10-minute token the app can use directly. */
async function speechToken(env: Env, headers: Record<string, string>): Promise<Response> {
  if (!env.AZURE_SPEECH_KEY || !env.AZURE_SPEECH_REGION) {
    return json({ error: "speech_not_configured" }, 503, headers);
  }
  const region = env.AZURE_SPEECH_REGION.trim().toLowerCase();
  const res = await fetch(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
    method: "POST",
    headers: { "Ocp-Apim-Subscription-Key": env.AZURE_SPEECH_KEY.trim(), "Content-Length": "0" },
  });
  if (!res.ok) {
    return json({ error: "azure_token_failed", status: res.status }, 502, headers);
  }
  return json({ token: await res.text(), region, expiresInSeconds: 540 }, 200, headers);
}

type ChatMessage = { role: "user" | "assistant"; content: string };

const MAX_HISTORY = 20; // messages kept, to keep each call cheap
const MAX_CHARS = 1000; // per user message

function cors(origin: string | null, env: Env): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS || "https://nickdav76-beep.github.io,http://localhost:5173")
    .split(",")
    .map((s) => s.trim());
  const ok = origin && allowed.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : allowed[0] ?? "",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Access-Code",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

export function cleanMessages(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw)) return null;
  const msgs: ChatMessage[] = [];
  for (const m of raw) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return null;
    msgs.push({ role: m.role, content: m.content.slice(0, MAX_CHARS) });
  }
  const trimmed = msgs.slice(-MAX_HISTORY);
  // The API needs the first message to be from the user; keep Lena's opener by
  // putting the opening instruction back in front of it.
  if (trimmed.length && trimmed[0].role === "assistant") {
    trimmed.unshift({ role: "user", content: OPENER_INSTRUCTION });
  }
  return trimmed;
}

/** Meaning of one word in its sentence, for the tap-a-word popup. */
async function wordInfo(body: any, env: Env, headers: Record<string, string>): Promise<Response> {
  const word = typeof body.word === "string" ? body.word.trim().slice(0, 40) : "";
  const sentence = typeof body.sentence === "string" ? body.sentence.trim().slice(0, 400) : "";
  if (!word) return json({ error: "bad_word" }, 400, headers);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.MODEL || "claude-haiku-5-5",
      max_tokens: 300,
      system: [{ type: "text", text: WORD_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: [WORD_TOOL],
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: `Word: ${word}\nSentence: ${sentence || word}` }],
    }),
  });
  if (!res.ok) return json({ error: "upstream", status: res.status }, 502, headers);
  const data: any = await res.json();
  const tool = (data.content ?? []).find((c: any) => c.type === "tool_use" && c.name === "word_info");
  const t = tool?.input;
  if (!t?.meaning) return json({ error: "no_output" }, 502, headers);
  return json(
    {
      word,
      meaning: String(t.meaning),
      lemma: String(t.lemma ?? word),
      pos: String(t.pos ?? ""),
      note: t.note ? String(t.note) : undefined,
      usage: {
        input: data.usage?.input_tokens ?? 0,
        output: data.usage?.output_tokens ?? 0,
        cached: data.usage?.cache_read_input_tokens ?? 0,
      },
    },
    200,
    headers,
  );
}

export function parseTutorOutput(data: any): Record<string, any> | null {
  const content: any[] = Array.isArray(data?.content) ? data.content : [];
  const tool = content.find((c) => c.type === "tool_use" && c.name === "tutor_turn");
  if (tool?.input) return tool.input;
  const text = content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n")
    .trim();
  return text ? { reply: text, translation: "", corrected_sentence: "", corrections: [] } : null;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const headers = cors(req.headers.get("Origin"), env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });

    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/") return json({ ok: true, service: "deutsch-buddy-api" }, 200, headers);
    if (req.method !== "POST" || !["/chat", "/speech-token", "/word"].includes(url.pathname)) {
      return json({ error: "not_found" }, 404, headers);
    }
    if (req.headers.get("X-Access-Code") !== env.ACCESS_CODE) return json({ error: "bad_access_code" }, 401, headers);
    if (url.pathname === "/speech-token") return speechToken(env, headers);

    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "bad_json" }, 400, headers);
    }
    if (url.pathname === "/word") return wordInfo(body, env, headers);

    const level: Level = LEVELS.includes(body.level) ? body.level : "A2";
    const scenario = typeof body.scenario === "string" ? body.scenario : "free";
    const messages = cleanMessages(body.messages ?? []);
    if (!messages) return json({ error: "bad_messages" }, 400, headers);
    if (messages.length === 0) messages.push({ role: "user", content: OPENER_INSTRUCTION });

    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: env.MODEL || "claude-haiku-5-5",
        max_tokens: 1024,
        // The main prompt is cached; the spoken-message note goes after it so the cache still hits.
        system: [
          { type: "text", text: systemPrompt(level, scenario), cache_control: { type: "ephemeral" } },
          ...(body.lastSpoken === true ? [{ type: "text", text: SPOKEN_NOTE }] : []),
        ],
        tools: [TUTOR_TOOL],
        // "auto" rather than a forced tool: forced tool choice can clash with the
        // model's adaptive thinking. The prompt requires the tool; plain text is a fallback.
        tool_choice: { type: "auto" },
        messages,
      }),
    });

    if (!apiRes.ok) {
      const detail = await apiRes.text();
      return json({ error: "upstream", status: apiRes.status, detail: detail.slice(0, 500) }, 502, headers);
    }

    const data: any = await apiRes.json();
    const t = parseTutorOutput(data);
    if (!t) return json({ error: "no_output" }, 502, headers);
    return json(
      {
        reply: String(t.reply ?? ""),
        translation: String(t.translation ?? ""),
        corrected_sentence: String(t.corrected_sentence ?? ""),
        corrections: Array.isArray(t.corrections) ? t.corrections : [],
        praise: t.praise ? String(t.praise) : undefined,
        usage: {
          input: data.usage?.input_tokens ?? 0,
          output: data.usage?.output_tokens ?? 0,
          cached: data.usage?.cache_read_input_tokens ?? 0,
        },
      },
      200,
      headers,
    );
  },
};
