import "./styles.css";
import { costUsd, sendChat, type Settings } from "./api";
import { sameIgnoringPunctuation, wordDiff } from "./diff";
import { playDevice, playTimed, stop, unlockAudio } from "./player";
import { store, type Turn } from "./store";
import { buildSegments, wordPositions, type WordTiming } from "./subtitles";
import { synthesize, VOICES } from "./voice";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const chat = $<HTMLElement>("chat");
const input = $<HTMLTextAreaElement>("input");
const composer = $<HTMLFormElement>("composer");
const sendBtn = $<HTMLButtonElement>("sendBtn");
const dialog = $<HTMLDialogElement>("settings");
const form = $<HTMLFormElement>("settingsForm");
const avatar = document.querySelector(".avatar") as HTMLElement;

let settings: Settings = store.settings();
let turns: Turn[] = store.turns();
let busy = false;

// Word timings for Lena's messages, keyed by message text, so the words can light up.
const timings = new Map<string, WordTiming[]>();
let speaking: { turn: number; word: number } | null = null;
let loadingTurn: number | null = null;

const TYPE_LABEL: Record<string, string> = {
  grammar: "Grammar",
  case: "Case",
  gender: "Gender",
  word_order: "Word order",
  verb: "Verb",
  vocabulary: "Word choice",
  spelling: "Spelling",
  style: "Sounds more natural",
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const ICON_PLAY = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>';
const ICON_STOP = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

function renderAssistant(t: Extract<Turn, { role: "assistant" }>, index: number) {
  const wrap = el("div", "msg lena");
  wrap.dataset.turn = String(index);
  const bubble = el("div", "bubble");
  bubble.lang = "de";
  bubble.title = "Tap for English";
  const words = timings.get(t.text);
  if (words?.length) {
    for (const seg of buildSegments(t.text, words)) {
      if (seg.word === null) bubble.append(seg.text);
      else {
        const w = el("span", "w", seg.text);
        w.dataset.w = String(seg.word);
        if (speaking?.turn === index && speaking.word === seg.word) w.classList.add("now");
        bubble.append(w);
      }
    }
  } else bubble.textContent = t.text;
  if (speaking?.turn === index) bubble.classList.add("speaking");
  wrap.append(bubble);

  const tr = el("div", "translation", t.translation);
  tr.hidden = true;
  bubble.addEventListener("click", () => {
    if (t.translation) tr.hidden = !tr.hidden;
  });

  if (settings.voice !== "off") {
    const controls = el("div", "voice-row");
    const isMe = speaking?.turn === index;
    const play = el("button", "voice-btn");
    play.type = "button";
    play.innerHTML = (isMe ? ICON_STOP + "<span>Stop</span>" : ICON_PLAY + "<span>Listen</span>");
    play.addEventListener("click", () => (isMe ? stop() : speak(index, 1)));
    const slow = el("button", "voice-btn");
    slow.type = "button";
    slow.innerHTML = ICON_PLAY + "<span>Slowly</span>";
    slow.addEventListener("click", () => speak(index, 0.75));
    controls.append(play, slow);
    if (loadingTurn === index) controls.append(el("span", "voice-loading", "loading voice…"));
    wrap.append(controls);
  }
  if (t.translation) wrap.append(tr);
  return wrap;
}

function renderCorrection(t: Extract<Turn, { role: "user" }>) {
  const fixes = t.corrections ?? [];
  const card = el("div", "card");
  if (fixes.length === 0 || !t.correctedSentence || sameIgnoringPunctuation(t.text, t.correctedSentence)) {
    card.classList.add("good");
    card.textContent = t.praise ? `✓ ${t.praise}` : "✓ Perfect";
    return card;
  }
  const line = el("p", "diff");
  line.lang = "de";
  for (const seg of wordDiff(t.text, t.correctedSentence)) {
    line.append(el(seg.kind === "same" ? "span" : seg.kind, undefined, seg.text), " ");
  }
  card.append(line);
  const list = el("ul", "fixes");
  for (const f of fixes) {
    const li = el("li");
    const head = el("div", "fix-head");
    const from = el("s", undefined, f.original);
    const to = el("b", undefined, f.corrected);
    from.lang = to.lang = "de";
    head.append(from, " → ", to, el("span", "chip", TYPE_LABEL[f.type] ?? f.type));
    li.append(head, el("div", "why", f.explanation));
    list.append(li);
  }
  card.append(list);
  return card;
}

function renderUser(t: Extract<Turn, { role: "user" }>, pending: boolean) {
  const wrap = el("div", "msg me");
  const bubble = el("div", "bubble", t.text);
  bubble.lang = "de";
  wrap.append(bubble);
  if (pending) wrap.append(el("div", "card checking", "Checking…"));
  else if (t.corrections) wrap.append(renderCorrection(t));
  return wrap;
}

function render() {
  const nearBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 120;
  chat.replaceChildren();
  turns.forEach((t, i) => {
    const pending = busy && i === turns.length - 1 && t.role === "user";
    chat.append(t.role === "assistant" ? renderAssistant(t, i) : renderUser(t, pending));
  });
  if (busy) chat.append(el("div", "typing", "Lena tippt…"));
  if (!settings.workerUrl) {
    const hint = el("div", "hint");
    hint.innerHTML = "First, open <b>Settings</b> and add your Worker URL and access code.";
    chat.append(hint);
  }
  $("levelLabel").textContent = settings.level;
  avatar.classList.toggle("talking", speaking !== null);
  if (nearBottom || busy) chat.scrollTop = chat.scrollHeight;
}

/** Light up one word without rebuilding the chat (this runs many times a second). */
function highlight(turn: number, word: number) {
  if (speaking) speaking.word = word;
  const bubble = chat.querySelector(`[data-turn="${turn}"] .bubble`);
  if (!bubble) return;
  bubble.querySelector(".w.now")?.classList.remove("now");
  if (word >= 0) bubble.querySelector(`[data-w="${word}"]`)?.classList.add("now");
}

async function speak(index: number, rate: number, auto = false) {
  const t = turns[index];
  if (!t || t.role !== "assistant" || settings.voice === "off" || !t.text) return;
  stop();
  const handlers = {
    onWord: (w: number) => highlight(index, w),
    onEnd: () => {
      if (speaking?.turn === index) speaking = null;
      render();
    },
  };
  try {
    if (settings.voice === "device") {
      timings.set(t.text, wordPositions(t.text).map((p) => ({ ...p, start: 0, end: 0 })));
      speaking = { turn: index, word: -1 };
      render();
      await playDevice(t.text, rate, handlers);
      return;
    }
    loadingTurn = index;
    render();
    const spoken = await synthesize(t.text, settings);
    timings.set(t.text, spoken.words);
    loadingTurn = null;
    speaking = { turn: index, word: -1 };
    render();
    await playTimed(spoken.url, spoken.words, rate, handlers);
  } catch (e) {
    loadingTurn = null;
    speaking = null;
    render();
    const msg = e instanceof Error ? e.message : "Lena's voice didn't work.";
    // A phone blocking sound before the first tap isn't worth an error: the Listen button still works.
    if (auto && msg.startsWith("Tap the play button")) return;
    showError(msg);
  }
}

function showError(msg: string) {
  chat.append(el("div", "error", msg));
  chat.scrollTop = chat.scrollHeight;
}

async function talk() {
  if (!settings.workerUrl) return dialog.showModal();
  busy = true;
  sendBtn.disabled = true;
  render();
  try {
    const history = turns.map((t) => ({ role: t.role, content: t.text }));
    const res = await sendChat(settings, history);
    const last = turns.at(-1);
    if (last && last.role === "user") {
      last.correctedSentence = res.corrected_sentence;
      last.corrections = res.corrections;
      last.praise = res.praise;
    }
    turns.push({ role: "assistant", text: res.reply, translation: res.translation });
    const u = store.usage();
    store.saveUsage({
      input: u.input + res.usage.input,
      output: u.output + res.usage.output,
      cached: u.cached + res.usage.cached,
    });
    store.saveTurns(turns);
    busy = false;
    render();
    if (settings.autoSpeak) speak(turns.length - 1, 1, true);
  } catch (e) {
    busy = false;
    render();
    showError(e instanceof Error ? e.message : "Something went wrong.");
  } finally {
    sendBtn.disabled = false;
  }
}

// Phones block sound until the user taps something; the first tap anywhere unlocks it.
document.addEventListener("pointerdown", unlockAudio, { once: true });
document.addEventListener("keydown", unlockAudio, { once: true });

composer.addEventListener("submit", (e) => {
  e.preventDefault();
  unlockAudio();
  const text = input.value.trim();
  if (!text || busy) return;
  stop();
  turns.push({ role: "user", text });
  store.saveTurns(turns);
  input.value = "";
  autosize();
  talk();
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    composer.requestSubmit();
  }
});

function autosize() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 140) + "px";
}
input.addEventListener("input", autosize);

const voiceSelect = form.elements.namedItem("voice") as HTMLSelectElement;
for (const v of VOICES) voiceSelect.append(new Option(v.label, v.id));

function openSettings() {
  for (const [k, v] of Object.entries(settings)) {
    const field = form.elements.namedItem(k) as HTMLInputElement | null;
    if (!field) continue;
    if (field.type === "checkbox") field.checked = Boolean(v);
    else field.value = String(v);
  }
  const u = store.usage();
  $("usage").textContent = `Used so far: ${(u.input + u.output + u.cached).toLocaleString()} tokens ≈ US$${costUsd(u).toFixed(3)}`;
  dialog.showModal();
}

$("settingsBtn").addEventListener("click", openSettings);

form.addEventListener("submit", () => {
  const data = new FormData(form);
  const before = settings.scenario + settings.level;
  settings = {
    workerUrl: String(data.get("workerUrl") || "").trim(),
    accessCode: String(data.get("accessCode") || ""),
    level: String(data.get("level") || "A2"),
    scenario: String(data.get("scenario") || "free"),
    voice: String(data.get("voice") || "de-DE-KatjaNeural"),
    autoSpeak: data.get("autoSpeak") === "on",
  };
  store.saveSettings(settings);
  stop();
  // A new scenario starts a fresh conversation so Lena's role makes sense.
  if (before !== settings.scenario + settings.level || turns.length === 0) {
    turns = [];
    store.saveTurns(turns);
    if (settings.workerUrl) talk();
  }
  render();
});

$("newChat").addEventListener("click", () => {
  stop();
  turns = [];
  store.saveTurns(turns);
  dialog.close();
  render();
  talk();
});

render();
if (settings.workerUrl && turns.length === 0) talk();
