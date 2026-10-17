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

// Haiku 5.5 list prices, US$ per million tokens (prompts under 100k tokens).
const PRICE = { input: 0.1, output: 0.5, cached: 0.01 };

export function costUsd(u: { input: number; output: number; cached: number }): number {
  return (u.input * PRICE.input + u.output * PRICE.output + u.cached * PRICE.cached) / 1e6;
}
