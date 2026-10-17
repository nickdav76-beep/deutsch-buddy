export type Correction = {
  original: string;
  corrected: string;
  explanation: string;
  type: string;
};

export type TutorResponse = {
  reply: string;
  translation: string;
  corrected_sentence: string;
  corrections: Correction[];
  praise?: string;
  usage: { input: number; output: number; cached: number };
};

export type Settings = {
  workerUrl: string;
  accessCode: string;
  level: string;
  scenario: string;
  voice: string; // an Azure voice name, "device" or "off"
  autoSpeak: boolean;
  listener: string; // "azure" or "browser"
  autoSend: boolean; // send automatically after a pause in speech
};

export async function sendChat(
  settings: Settings,
  messages: { role: "user" | "assistant"; content: string }[],
  lastSpoken = false,
): Promise<TutorResponse> {
  const url = settings.workerUrl.replace(/\/+$/, "") + "/chat";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Access-Code": settings.accessCode },
    body: JSON.stringify({ level: settings.level, scenario: settings.scenario, messages, lastSpoken }),
  });
  if (res.status === 401) throw new Error("The access code doesn't match the one set on the Worker.");
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Server error ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

export type WordInfo = {
  word: string;
  meaning: string;
  lemma: string;
  pos: string;
  note?: string;
  usage?: { input: number; output: number; cached: number };
};

const WORD_CACHE_KEY = "db.words";
const WORD_CACHE_MAX = 400;

function readWordCache(): Record<string, WordInfo> {
  try {
    return JSON.parse(localStorage.getItem(WORD_CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}

/** Look up one word in the sentence it came from. Answers are kept on the device, so a second tap is instant and free. */
export async function lookupWord(settings: Settings, word: string, sentence: string): Promise<WordInfo> {
  const key = word.toLowerCase() + "|" + sentence;
  const cache = readWordCache();
  if (cache[key]) return { ...cache[key], usage: undefined };
  const res = await fetch(settings.workerUrl.replace(/\/+$/, "") + "/word", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Access-Code": settings.accessCode },
    body: JSON.stringify({ word, sentence }),
  });
  if (res.status === 404) throw new Error("Update the Worker code to use word lookups.");
  if (!res.ok) throw new Error(`Couldn't look that up (error ${res.status}).`);
  const info: WordInfo = await res.json();
  try {
    const keys = Object.keys(cache);
    if (keys.length >= WORD_CACHE_MAX) keys.slice(0, keys.length - WORD_CACHE_MAX + 1).forEach((k) => delete cache[k]);
    cache[key] = { ...info, usage: undefined };
    localStorage.setItem(WORD_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* storage full: still show the answer */
  }
  return info;
}

/** The sentence around a character position, so the lookup has just enough context. */
export function sentenceAround(text: string, at: number): string {
  const ends = /[.!?]/g;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = ends.exec(text))) {
    if (m.index >= at) return text.slice(start, m.index + 1).trim();
    start = m.index + 1;
  }
  return text.slice(start).trim();
}

// Haiku 5.5 list prices, US$ per million tokens (prompts under 100k tokens).
const PRICE = { input: 0.1, output: 0.5, cached: 0.01 };

export function costUsd(u: { input: number; output: number; cached: number }): number {
  return (u.input * PRICE.input + u.output * PRICE.output + u.cached * PRICE.cached) / 1e6;
}
