import "./styles.css";
import { costUsd, lookupWord, sendChat, sentenceAround, type Settings } from "./api";
import { sameIgnoringPunctuation, wordDiff } from "./diff";
import { playDevice, playTimed, stop, unlockAudio } from "./player";
import { store, type Turn } from "./store";
import { buildSegments, wordPositions, type WordTiming } from "./subtitles";
import { synthesize, VOICES } from "./voice";
import { LISTENERS, startListening, type Session } from "./listen";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const chat = $<HTMLElement>("chat");
const input = $<HTMLTextAreaElement>("input");
const composer = $<HTMLFormElement>("composer");
const sendBtn = $<HTMLButtonElement>("sendBtn");
const dialog = $<HTMLDialogElement>("settings");
const form = $<HTMLFormElement>("settingsForm");
const avatar = document.querySelector(".avatar") as HTMLElement;
const micBtn = $<HTMLButtonElement>("micBtn");

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
const ICON_TRANSLATE =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h9M8.5 3v2M6 5c.6 3.2 2.8 5.8 5.5 7M11 5c-.8 3.6-3.4 6.6-7 8"/><path d="M12.5 21l4-9 4 9M14 18h5"/></svg>';
// Which of Lena's messages currently show their English (kept across redraws).
const shownEnglish = new Set<number>();
const ICON_STOP = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

function renderAssistant(t: Extract<Turn, { role: "assistant" }>, index: number) {
  const wrap = el("div", "msg lena");
  wrap.dataset.turn = String(index);
  const bubble = el("div", "bubble");
  bubble.lang = "de";
  // Every word is its own span: it can light up while spoken and be tapped for its meaning.
  const words = timings.get(t.text) ?? wordPositions(t.text).map((p) => ({ ...p, start: 0, end: 0 }));
  for (const seg of buildSegments(t.text, words)) {
    if (seg.word === null) bubble.append(seg.text);
    else {
      const w = el("span", "w", seg.text);
      w.dataset.w = String(seg.word);
      w.dataset.o = String(words[seg.word].offset);
      if (speaking?.turn === index && speaking.word === seg.word) w.classList.add("now");
      if (picked?.turn === index && picked.offset === words[seg.word].offset) w.classList.add("picked");
      bubble.append(w);
    }
  }
  bubble.addEventListener("click", (e) => {
    const w = (e.target as HTMLElement).closest(".w") as HTMLElement | null;
    if (w) showWord(w, t.text, index);
  });
  if (speaking?.turn === index) bubble.classList.add("speaking");
  wrap.append(bubble);

  const tr = el("div", "translation", t.translation);
  tr.hidden = !shownEnglish.has(index);
  const toggleEnglish = () => {
    if (!t.translation) return;
    if (shownEnglish.has(index)) shownEnglish.delete(index);
    else shownEnglish.add(index);
    tr.hidden = !shownEnglish.has(index);
    enBtn.classList.toggle("active", !tr.hidden);
    enBtn.setAttribute("aria-pressed", String(!tr.hidden));
  };
  const controls = el("div", "voice-row");
  const enBtn = el("button", "voice-btn en-btn");
  enBtn.type = "button";
  enBtn.innerHTML = ICON_TRANSLATE + "<span>English</span>";
  enBtn.classList.toggle("active", !tr.hidden);
  enBtn.setAttribute("aria-pressed", String(!tr.hidden));
  enBtn.addEventListener("click", toggleEnglish);

  if (settings.voice !== "off") {
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
  }
  if (t.translation) controls.append(enBtn);
  if (loadingTurn === index) controls.append(el("span", "voice-loading", "loading voice…"));
  if (controls.childElementCount) wrap.append(controls);
  if (t.translation) wrap.append(tr);
  return wrap;
}

// ---------- Tap a word for its meaning ----------
const pop = el("div", "word-pop");
pop.hidden = true;
pop.setAttribute("role", "dialog");
document.body.append(pop);
let picked: { turn: number; offset: number } | null = null;
let lookupSeq = 0;

function closeWord() {
  if (pop.hidden) return;
  pop.hidden = true;
  picked = null;
  chat.querySelector(".w.picked")?.classList.remove("picked");
}

function placePop(anchor: HTMLElement) {
  const r = anchor.getBoundingClientRect();
  const w = Math.min(300, window.innerWidth - 24);
  pop.style.width = w + "px";
  const left = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 12));
  pop.style.left = left + "px";
  const below = r.bottom + 8;
  const h = pop.offsetHeight || 120;
  pop.style.top = (below + h > window.innerHeight - 12 ? Math.max(12, r.top - h - 8) : below) + "px";
}

async function showWord(span: HTMLElement, text: string, turn: number) {
  const word = (span.textContent || "").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  if (!word) return;
  const offset = Number(span.dataset.o);
  if (picked?.turn === turn && picked.offset === offset && !pop.hidden) return closeWord();
  chat.querySelector(".w.picked")?.classList.remove("picked");
  span.classList.add("picked");
  picked = { turn, offset };
  const seq = ++lookupSeq;

  pop.replaceChildren(el("div", "wp-word", word), el("div", "wp-loading", "Looking up…"));
  pop.lang = "de";
  pop.hidden = false;
  placePop(span);

  try {
    const info = await lookupWord(settings, word, sentenceAround(text, offset));
    if (seq !== lookupSeq) return; // another word was tapped meanwhile
    if (info.usage) {
      const u = store.usage();
      store.saveUsage({ input: u.input + info.usage.input, output: u.output + info.usage.output, cached: u.cached + info.usage.cached });
    }
    const head = el("div", "wp-head");
    head.append(el("span", "wp-word", word));
    if (settings.voice !== "off") {
      const say = el("button", "wp-say");
      say.type = "button";
      say.setAttribute("aria-label", "Hear " + word);
      say.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
      say.addEventListener("click", () => sayWord(word));
      head.append(say);
    }
    const meta = el("div", "wp-meta");
    if (info.lemma && info.lemma.toLowerCase() !== word.toLowerCase()) meta.append(el("span", "wp-lemma", info.lemma));
    if (info.pos) meta.append(el("span", "wp-pos", info.pos));
    const meaning = el("div", "wp-meaning", info.meaning);
    meaning.lang = "en";
    pop.replaceChildren(head);
    if (meta.childElementCount) pop.append(meta);
    pop.append(meaning);
    if (info.note) {
      const note = el("div", "wp-note", info.note);
      note.lang = "en";
      pop.append(note);
    }
    placePop(chat.querySelector(".w.picked") ?? span);
  } catch (e) {
    if (seq !== lookupSeq) return;
    pop.replaceChildren(el("div", "wp-word", word), el("div", "wp-error", e instanceof Error ? e.message : "Couldn't look that up."));
  }
}

async function sayWord(word: string) {
  unlockAudio();
  try {
    if (settings.voice === "device") await playDevice(word, 0.9, { onWord: () => {}, onEnd: () => {} });
    else {
      const s = await synthesize(word, settings);
      await playTimed(s.url, [], 0.9, { onWord: () => {}, onEnd: () => {} });
    }
  } catch (e) {
    showError(e instanceof Error ? e.message : "Couldn't play that word.");
  }
}

document.addEventListener("pointerdown", (e) => {
  const t = e.target as HTMLElement;
  if (!pop.hidden && !pop.contains(t) && !t.closest(".lena .w")) closeWord();
});
document.addEventListener("keydown", (e) => e.key === "Escape" && closeWord());
chat.addEventListener("scroll", closeWord, { passive: true });
window.addEventListener("resize", closeWord);

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
  if (t.spoken) {
    const tag = el("div", "spoken-tag");
    tag.innerHTML =
      '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>spoken';
    wrap.append(tag);
  }
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
    const lastTurn = turns.at(-1);
    const res = await sendChat(settings, history, lastTurn?.role === "user" && Boolean(lastTurn.spoken));
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

// ---------- Speaking to Lena ----------
let session: Session | null = null;
let micStarting = false;
let spokenDraft = false; // the text box holds what was heard, not what was typed
let idleTimer = 0;
let capTimer = 0;
const PAUSE_MS = 2200; // a pause this long ends the turn when auto-send is on
const MAX_MS = 60000;

function micUi() {
  const on = session !== null;
  micBtn.classList.toggle("on", on);
  micBtn.classList.toggle("starting", micStarting);
  micBtn.setAttribute("aria-pressed", String(on));
  micBtn.setAttribute("aria-label", on ? "Stop listening" : "Speak");
  micBtn.disabled = busy && !on;
  input.classList.toggle("listening", on);
  input.placeholder = on ? "Ich höre zu…" : "Schreib oder sprich…";
}

function stopMic() {
  clearTimeout(idleTimer);
  clearTimeout(capTimer);
  session?.stop();
}

async function startMic() {
  if (session || micStarting || busy) return;
  if (!settings.workerUrl) return dialog.showModal();
  unlockAudio();
  stop(); // don't let the microphone hear Lena
  micStarting = true;
  input.value = "";
  autosize();
  micUi();
  try {
    session = await startListening(settings, {
      onText: (text) => {
        input.value = text;
        spokenDraft = true;
        autosize();
        clearTimeout(idleTimer);
        if (settings.autoSend && text.trim()) idleTimer = window.setTimeout(stopMic, PAUSE_MS);
      },
      onEnd: (err) => {
        clearTimeout(idleTimer);
        clearTimeout(capTimer);
        session = null;
        micUi();
        if (err) return showError(err.message);
        if (settings.autoSend && input.value.trim()) composer.requestSubmit();
        else input.focus();
      },
    });
    capTimer = window.setTimeout(stopMic, MAX_MS);
  } catch (e) {
    showError(e instanceof Error ? e.message : "The microphone couldn't start.");
  } finally {
    micStarting = false;
    micUi();
  }
}

micBtn.addEventListener("click", () => (session ? stopMic() : startMic()));

// Typing in the box means it's no longer purely what the microphone heard.
input.addEventListener("input", () => (spokenDraft = false));

composer.addEventListener("submit", (e) => {
  e.preventDefault();
  unlockAudio();
  if (session) return stopMic(); // pressing send while talking finishes the turn
  const text = input.value.trim();
  if (!text || busy) return;
  stop();
  turns.push({ role: "user", text, spoken: spokenDraft });
  spokenDraft = false;
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
const listenerSelect = form.elements.namedItem("listener") as HTMLSelectElement;
for (const l of LISTENERS) listenerSelect.append(new Option(l.label, l.id));

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
    listener: String(data.get("listener") || "azure"),
    autoSend: data.get("autoSend") === "on",
  };
  store.saveSettings(settings);
  stop();
  // A new scenario starts a fresh conversation so Lena's role makes sense.
  if (before !== settings.scenario + settings.level || turns.length === 0) {
    turns = [];
    shownEnglish.clear();
    store.saveTurns(turns);
    if (settings.workerUrl) talk();
  }
  render();
});

$("newChat").addEventListener("click", () => {
  stop();
  turns = [];
  shownEnglish.clear();
  store.saveTurns(turns);
  dialog.close();
  render();
  talk();
});

render();
if (settings.workerUrl && turns.length === 0) talk();
