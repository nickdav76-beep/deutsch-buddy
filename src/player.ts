import { activeWord, wordAtChar, wordPositions, type WordTiming } from "./subtitles";

// One audio element for the whole app. Phones only allow sound after a tap, so the
// element is "unlocked" on the first tap and reused for every reply after that.
const audio = new Audio();
audio.preload = "auto";
let unlocked = false;

/** A tenth of a second of silence as a WAV data URI, used only to unlock audio on phones. */
function silentWav(): string {
  const rate = 8000;
  const samples = rate / 10;
  const buf = new DataView(new ArrayBuffer(44 + samples));
  const str = (o: number, s: string) => [...s].forEach((c, i) => buf.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  buf.setUint32(4, 36 + samples, true);
  str(8, "WAVEfmt ");
  buf.setUint32(16, 16, true);
  buf.setUint16(20, 1, true); // PCM
  buf.setUint16(22, 1, true); // mono
  buf.setUint32(24, rate, true);
  buf.setUint32(28, rate, true);
  buf.setUint16(32, 1, true);
  buf.setUint16(34, 8, true); // 8-bit
  str(36, "data");
  buf.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) buf.setUint8(44 + i, 128); // 128 = silence for 8-bit audio
  let bin = "";
  new Uint8Array(buf.buffer).forEach((b) => (bin += String.fromCharCode(b)));
  return "data:audio/wav;base64," + btoa(bin);
}
const SILENCE = silentWav();

export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  audio.src = SILENCE;
  audio.play().catch(() => (unlocked = false));
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

type Handlers = { onWord: (i: number) => void; onEnd: () => void };
let stopCurrent: (() => void) | null = null;

export function stop() {
  stopCurrent?.();
  stopCurrent = null;
}

/** Play synthesised audio and report which word is being spoken. */
export function playTimed(url: string, words: WordTiming[], rate: number, h: Handlers): Promise<void> {
  stop();
  return new Promise((resolve, reject) => {
    let raf = 0;
    let last = -2;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      audio.onended = audio.onerror = null;
      h.onEnd();
      resolve();
    };
    const tick = () => {
      const i = activeWord(words, audio.currentTime);
      if (i !== last) h.onWord((last = i));
      raf = requestAnimationFrame(tick);
    };
    stopCurrent = () => {
      audio.pause();
      finish();
    };
    audio.onended = finish;
    audio.onerror = () => {
      finish();
      reject(new Error("The audio couldn't be played."));
    };
    audio.src = url;
    audio.playbackRate = rate;
    audio.preservesPitch = true;
    audio
      .play()
      .then(() => (raf = requestAnimationFrame(tick)))
      .catch((e) => {
        finish();
        reject(e?.name === "NotAllowedError" ? new Error("Tap the play button to hear Lena.") : e);
      });
  });
}

/** Free fallback: the phone or browser's own German voice. */
export function playDevice(text: string, rate: number, h: Handlers): Promise<void> {
  stop();
  if (!("speechSynthesis" in window)) return Promise.reject(new Error("This browser has no built-in voice."));
  const words = wordPositions(text);
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "de-DE";
    u.rate = rate;
    const de = speechSynthesis.getVoices().filter((v) => v.lang.startsWith("de"));
    u.voice = de.find((v) => /premium|enhanced|natural|neural/i.test(v.name)) ?? de[0] ?? null;
    u.onboundary = (e) => h.onWord(wordAtChar(words, e.charIndex));
    const end = () => {
      h.onEnd();
      resolve();
    };
    u.onend = u.onerror = end;
    stopCurrent = () => {
      speechSynthesis.cancel();
      end();
    };
    speechSynthesis.speak(u);
  });
}
