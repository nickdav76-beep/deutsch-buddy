import type { Correction, Settings } from "./api";

export type Turn =
  | { role: "assistant"; text: string; translation: string }
  | {
      role: "user";
      text: string;
      correctedSentence?: string;
      corrections?: Correction[];
      praise?: string;
    };

export type Usage = { input: number; output: number; cached: number };

const KEY = { settings: "db.settings", turns: "db.turns", usage: "db.usage" };

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the app still works for this visit */
  }
}

export const defaultSettings: Settings = { workerUrl: "", accessCode: "", level: "A2", scenario: "free" };

export const store = {
  settings: () => load(KEY.settings, defaultSettings),
  saveSettings: (s: Settings) => save(KEY.settings, s),
  turns: (): Turn[] => {
    try {
      return JSON.parse(localStorage.getItem(KEY.turns) || "[]");
    } catch {
      return [];
    }
  },
  saveTurns: (t: Turn[]) => save(KEY.turns, t),
  usage: () => load<Usage>(KEY.usage, { input: 0, output: 0, cached: 0 }),
  saveUsage: (u: Usage) => save(KEY.usage, u),
};
