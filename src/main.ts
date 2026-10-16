import "./styles.css";
import { costUsd, sendChat, type Settings } from "./api";
import { sameIgnoringPunctuation, wordDiff } from "./diff";
import { store, type Turn } from "./store";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const chat = $<HTMLElement>("chat");
const input = $<HTMLTextAreaElement>("input");
const composer = $<HTMLFormElement>("composer");
const sendBtn = $<HTMLButtonElement>("sendBtn");
const dialog = $<HTMLDialogElement>("settings");
const form = $<HTMLFormElement>("settingsForm");

let settings: Settings = store.settings();
let turns: Turn[] = store.turns();
let busy = false;

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

function renderAssistant(t: Extract<Turn, { role: "assistant" }>) {
  const wrap = el("div", "msg lena");
  const bubble = el("button", "bubble");
  bubble.type = "button";
  bubble.lang = "de";
  bubble.textContent = t.text;
  bubble.title = "Tap for English";
  wrap.append(bubble);
  if (t.translation) {
    const tr = el("div", "translation", t.translation);
    tr.hidden = true;
    bubble.addEventListener("click", () => (tr.hidden = !tr.hidden));
    wrap.append(tr);
  }
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
  chat.replaceChildren();
  turns.forEach((t, i) => {
    const pending = busy && i === turns.length - 1 && t.role === "user";
    chat.append(t.role === "assistant" ? renderAssistant(t) : renderUser(t, pending));
  });
  if (busy) chat.append(el("div", "typing", "Lena tippt…"));
  if (!settings.workerUrl) {
    const hint = el("div", "hint");
    hint.innerHTML = "First, open <b>Settings</b> and add your Worker URL and access code.";
    chat.append(hint);
  }
  $("levelLabel").textContent = settings.level;
  chat.scrollTop = chat.scrollHeight;
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
  } catch (e) {
    busy = false;
    render();
    showError(e instanceof Error ? e.message : "Something went wrong.");
  } finally {
    sendBtn.disabled = false;
  }
}

composer.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || busy) return;
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

function openSettings() {
  for (const [k, v] of Object.entries(settings)) {
    const field = form.elements.namedItem(k) as HTMLInputElement | null;
    if (field) field.value = v;
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
  };
  store.saveSettings(settings);
  // A new scenario starts a fresh conversation so Lena's role makes sense.
  if (before !== settings.scenario + settings.level || turns.length === 0) {
    turns = [];
    store.saveTurns(turns);
    if (settings.workerUrl) talk();
  }
  render();
});

$("newChat").addEventListener("click", () => {
  turns = [];
  store.saveTurns(turns);
  dialog.close();
  render();
  talk();
});

render();
if (settings.workerUrl && turns.length === 0) talk();
