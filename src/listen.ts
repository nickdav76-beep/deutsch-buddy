import type { Settings } from "./api";
import { getToken } from "./voice";

export const LISTENERS: { id: string; label: string }[] = [
  { id: "azure", label: "Azure (most accurate, 5 free hours a month)" },
  { id: "browser", label: "Browser (free, quality depends on device)" },
];

export type ListenHandlers = {
  /** The full transcript so far, including words still being worked out. */
  onText: (text: string) => void;
  /** Called with no argument when listening ends normally, or with an error. */
  onEnd: (error?: Error) => void;
};

export type Session = { stop: () => void };

declare global {
  interface Window {
    __dbFakeListen?: (h: ListenHandlers) => Session;
    webkitSpeechRecognition?: any;
    SpeechRecognition?: any;
  }
}

/** Confirmed phrases plus the phrase still being heard, as one tidy sentence. */
export function joinTranscript(finals: string[], interim: string): string {
  return [...finals, interim]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+([.,!?;:])/g, "$1");
}

export function browserCanListen(): boolean {
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export async function startListening(settings: Settings, h: ListenHandlers): Promise<Session> {
  if (window.__dbFakeListen) return window.__dbFakeListen(h);
  return settings.listener === "browser" ? browserListen(h) : azureListen(settings, h);
}

async function azureListen(settings: Settings, h: ListenHandlers): Promise<Session> {
  const [sdk, t] = await Promise.all([import("microsoft-cognitiveservices-speech-sdk"), getToken(settings)]);
  const config = sdk.SpeechConfig.fromAuthorizationToken(t.value, t.region);
  config.speechRecognitionLanguage = "de-DE";
  // Let learners pause to think mid-sentence without the phrase being cut off.
  config.setProperty(sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, "1200");
  const audio = sdk.AudioConfig.fromDefaultMicrophoneInput();
  const rec = new sdk.SpeechRecognizer(config, audio);
  const finals: string[] = [];
  let ended = false;

  const finish = (error?: Error) => {
    if (ended) return;
    ended = true;
    rec.stopContinuousRecognitionAsync(
      () => {
        rec.close();
        h.onEnd(error);
      },
      () => {
        rec.close();
        h.onEnd(error);
      },
    );
  };

  rec.recognizing = (_s, e) => h.onText(joinTranscript(finals, e.result.text));
  rec.recognized = (_s, e) => {
    if (e.result.reason === sdk.ResultReason.RecognizedSpeech && e.result.text) {
      finals.push(e.result.text);
      h.onText(joinTranscript(finals, ""));
    }
  };
  rec.canceled = (_s, e) => {
    if (e.reason === sdk.CancellationReason.Error) {
      const msg = /permission|NotAllowed/i.test(e.errorDetails)
        ? "Microphone access was blocked. Allow the microphone for this site and try again."
        : "Listening stopped: " + e.errorDetails;
      finish(new Error(msg));
    }
  };

  await new Promise<void>((resolve, reject) =>
    rec.startContinuousRecognitionAsync(resolve, (err) => {
      rec.close();
      reject(new Error(/permission|NotAllowed/i.test(err) ? "Microphone access was blocked. Allow the microphone for this site and try again." : err));
    }),
  );
  return { stop: () => finish() };
}

function browserListen(h: ListenHandlers): Session {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) throw new Error("This browser can't do speech recognition. Switch to Azure listening in settings.");
  const rec = new Ctor();
  rec.lang = "de-DE";
  rec.continuous = true;
  rec.interimResults = true;
  let error: Error | undefined;
  let ended = false;

  rec.onresult = (e: any) => {
    const finals: string[] = [];
    let interim = "";
    for (let i = 0; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finals.push(r[0].transcript);
      else interim += r[0].transcript;
    }
    h.onText(joinTranscript(finals, interim));
  };
  rec.onerror = (e: any) => {
    if (e.error === "no-speech" || e.error === "aborted") return;
    error = new Error(
      e.error === "not-allowed" || e.error === "service-not-allowed"
        ? "Microphone access was blocked. Allow the microphone for this site and try again."
        : "Listening stopped: " + e.error,
    );
  };
  rec.onend = () => {
    if (ended) return;
    ended = true;
    h.onEnd(error);
  };
  rec.start();
  return { stop: () => rec.stop() };
}
