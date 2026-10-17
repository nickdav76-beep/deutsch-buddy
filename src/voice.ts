import type { Settings } from "./api";
import { alignWords, type WordTiming } from "./subtitles";

export const VOICES: { id: string; label: string }[] = [
  { id: "de-DE-KatjaNeural", label: "Katja (warm, clear)" },
  { id: "de-DE-AmalaNeural", label: "Amala (bright)" },
  { id: "de-DE-SeraphinaMultilingualNeural", label: "Seraphina (very natural)" },
  { id: "de-DE-ConradNeural", label: "Conrad (male)" },
  { id: "device", label: "Device voice (free, no highlight on some phones)" },
  { id: "off", label: "Off — text only" },
];

export type Spoken = { url: string; words: WordTiming[] };

// The tests and the screenshot script can swap in a fake synthesiser.
declare global {
  interface Window {
    __dbFakeSynth?: (text: string) => Promise<Spoken>;
  }
}

let token: { value: string; region: string; until: number } | null = null;

export async function getToken(settings: Settings) {
  if (token && Date.now() < token.until) return token;
  const res = await fetch(settings.workerUrl.replace(/\/+$/, "") + "/speech-token", {
    method: "POST",
    headers: { "X-Access-Code": settings.accessCode },
  });
  if (res.status === 503) throw new Error("Voice isn't set up on the Worker yet (Azure key and region missing).");
  if (!res.ok) throw new Error(`Couldn't get a voice token (error ${res.status}).`);
  const data = await res.json();
  token = { value: data.token, region: data.region, until: Date.now() + (data.expiresInSeconds ?? 540) * 1000 };
  return token;
}

const cache = new Map<string, Promise<Spoken>>();

/** Turn Lena's text into audio plus the time each word is spoken. Results are cached per text and voice. */
export function synthesize(text: string, settings: Settings): Promise<Spoken> {
  const key = settings.voice + "|" + text;
  let p = cache.get(key);
  if (!p) {
    p = window.__dbFakeSynth ? window.__dbFakeSynth(text) : azureSynthesize(text, settings);
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

export function cachedSpoken(text: string, settings: Settings): Promise<Spoken> | undefined {
  return cache.get(settings.voice + "|" + text);
}

async function azureSynthesize(text: string, settings: Settings): Promise<Spoken> {
  const [sdk, t] = await Promise.all([import("microsoft-cognitiveservices-speech-sdk"), getToken(settings)]);
  const config = sdk.SpeechConfig.fromAuthorizationToken(t.value, t.region);
  config.speechSynthesisVoiceName = settings.voice;
  config.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3;
  // null audio output: we get the audio back as data and play it ourselves, so words and sound stay in sync.
  const synth = new sdk.SpeechSynthesizer(config, null);
  const raw: { text: string; offset: number; start: number; end: number }[] = [];
  synth.wordBoundary = (_s, e) => {
    if (e.boundaryType !== sdk.SpeechSynthesisBoundaryType.Word) return;
    const start = e.audioOffset / 1e7;
    raw.push({ text: e.text, offset: e.textOffset, start, end: start + e.duration / 1e7 });
  };
  try {
    const result = await new Promise<import("microsoft-cognitiveservices-speech-sdk").SpeechSynthesisResult>(
      (resolve, reject) => synth.speakTextAsync(text, resolve, (err) => reject(new Error(err))),
    );
    if (result.reason !== sdk.ResultReason.SynthesizingAudioCompleted) {
      const why = sdk.CancellationDetails.fromResult(result as any)?.errorDetails ?? "unknown error";
      if (/401|auth/i.test(why)) token = null;
      throw new Error("Voice failed: " + why);
    }
    const url = URL.createObjectURL(new Blob([result.audioData], { type: "audio/mpeg" }));
    return { url, words: alignWords(text, raw) };
  } finally {
    synth.close();
  }
}
