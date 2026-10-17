import portrait from "./assets/lena.webp";

/** One mouth-shape event from Azure: when (seconds into the audio) and which shape (0–21). */
export type Viseme = { t: number; id: number };

/**
 * How open (0–1) and how wide (−1 rounded … +1 spread) the mouth is for each Azure viseme.
 * Azure's 22 visemes: 0 silence, 1 æ/ə/ʌ, 2 ɑ, 3 ɔ, 4 ɛ/ʊ, 5 ɝ, 6 i/ɪ/j, 7 u/w, 8 o, 9 aʊ,
 * 10 ɔɪ, 11 aɪ, 12 h, 13 r, 14 l, 15 s/z, 16 ʃ/tʃ, 17 ð, 18 f/v, 19 t/d/n, 20 k/g/ŋ, 21 p/b/m.
 */
export const VISEME_SHAPES: [open: number, wide: number][] = [
  [0, 0], [0.55, 0.1], [0.9, 0], [0.7, -0.4], [0.5, 0.2], [0.45, -0.2], [0.3, 0.6], [0.25, -0.75],
  [0.55, -0.6], [0.8, -0.2], [0.65, -0.3], [0.85, 0.1], [0.4, 0], [0.35, -0.3], [0.35, 0.2], [0.15, 0.5],
  [0.2, -0.45], [0.25, 0.2], [0.1, 0.25], [0.2, 0.2], [0.3, 0], [0, 0],
];

/** The viseme in effect at time t (the last one that started at or before t). */
export function visemeAt(visemes: Viseme[], t: number): number {
  let lo = 0;
  let hi = visemes.length - 1;
  let found = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (visemes[mid].t <= t) {
      found = visemes[mid].id;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

export type Mood = "idle" | "listening" | "thinking";

// Face rig drawn over the portrait (coordinates match the 420×520 picture).
const MARKUP = `
<svg class="lena-svg" viewBox="10 95 400 340" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Lena">
  <defs>
    <filter id="lsoft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.6"/></filter>
    <filter id="llid" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.6"/></filter>
    <linearGradient id="llidg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0a3a2"/><stop offset="0.6" stop-color="#f4b0aa"/><stop offset="1" stop-color="#f7bdb0"/></linearGradient>
  </defs>
  <g class="lena-head">
    <g class="lena-breathe">
      <image href="${portrait}" x="0" y="0" width="420" height="520"/>
      <ellipse cx="210" cy="315" rx="37" ry="21" fill="#fed1bb" filter="url(#lsoft)"/>
      <ellipse cx="212" cy="334" rx="17" ry="3" fill="#ec9a84" opacity="0.6" filter="url(#lsoft)"/>
      <g data-part="mouth">
        <g data-part="inner">
          <path d="M186 312.3C196 314.5 224 314.5 235 311.8C229 322 221 325 211 325C200 325 191 321 186 312.3Z" fill="#5c1f28"/>
          <path d="M196 313.4C204 314.4 218 314.4 226 313.2L224.5 315.4C217 316 205 316 197.5 315.4Z" fill="#f3e6e8" opacity="0.9"/>
        </g>
        <g data-part="upper">
          <path d="M181 311C187 306 194 300 201 300C205 300 207 302 209 302.5C211 301.5 214 299 219 299C226 299 232 305 238 310C224 312.5 195 312.5 181 311Z" fill="#f4635c"/>
          <path d="M192 305.5C198 302.5 204 302.5 209 304.5C214 302 221 302 228 305" fill="none" stroke="#f88b82" stroke-width="1.4" opacity="0.8"/>
        </g>
        <g data-part="lower">
          <path d="M184 312C189 324 199 331 211 331C223 331 232 323 236 311.5C222 314 198 314 184 312Z" fill="#fb8779"/>
          <ellipse cx="214" cy="320" rx="9" ry="2.6" fill="#fda294" opacity="0.8"/>
        </g>
        <path d="M177 311C192 313 226 313 244 309.5" fill="none" stroke="#953132" stroke-width="1.7" stroke-linecap="round"/>
      </g>
      <g class="lena-lid">
        <path d="M137 221C143 211 152 207.5 162 207.5C172 207.5 180 212 184 219C180 230 170 236 160 236C149 236 141 230 137 221Z" fill="url(#llidg)" filter="url(#llid)"/>
        <path d="M138 224C147 232.5 174 232.5 183 222" fill="none" stroke="#3c103a" stroke-width="2" stroke-linecap="round"/>
        <path d="M142 228L138.5 231M147 230.5L145 234M153 231.8L152 235.2" stroke="#3c103a" stroke-width="1" stroke-linecap="round"/>
      </g>
      <g class="lena-lid">
        <path d="M231 219C236 211 245 208 255 208C265 208 273 212 278 220C274 230 265 235 254 235C243 235 235 229 231 219Z" fill="url(#llidg)" filter="url(#llid)"/>
        <path d="M232 222C241 231 268 231 277 222" fill="none" stroke="#3c103a" stroke-width="2" stroke-linecap="round"/>
        <path d="M272 227L275.5 230M266 229.6L268 233M260 230.6L261 234" stroke="#3c103a" stroke-width="1" stroke-linecap="round"/>
      </g>
    </g>
  </g>
</svg>`;

// Mouth pivot points in picture coordinates.
const CX = 210.5;
const LIP_LINE = 311.8;

export class Avatar {
  readonly el: HTMLElement;
  private head: SVGGElement;
  private mouth: SVGGElement;
  private inner: SVGGElement;
  private upper: SVGGElement;
  private lower: SVGGElement;
  private cur = { open: 0, wide: 0 };
  private target = { open: 0, wide: 0 };
  private visemes: Viseme[] | null = null;
  private faking = false;
  private raf = 0;

  constructor(host: HTMLElement) {
    this.el = host;
    host.innerHTML = MARKUP; // fixed markup defined above, no user content
    const q = <T extends Element>(sel: string) => host.querySelector(sel) as unknown as T;
    this.head = q(".lena-head");
    this.mouth = q('[data-part="mouth"]');
    this.inner = q('[data-part="inner"]');
    this.upper = q('[data-part="upper"]');
    this.lower = q('[data-part="lower"]');
    this.apply();
  }

  /** Start lip-syncing to audio whose mouth shapes are known. Call `at(t)` every frame. */
  speak(visemes: Viseme[]) {
    this.visemes = visemes.length ? visemes : null;
    this.faking = !this.visemes; // no shapes (e.g. device voice): move the mouth in a natural-looking rhythm
    this.loop();
  }

  /** Report the audio's current time so the mouth matches what is heard. */
  at(t: number) {
    if (!this.visemes) return;
    const [open, wide] = VISEME_SHAPES[visemeAt(this.visemes, t)] ?? [0, 0];
    this.target = { open, wide };
  }

  stopSpeaking() {
    this.visemes = null;
    this.faking = false;
    this.target = { open: 0, wide: 0 };
    this.loop(); // keeps running until the mouth has closed, then stops
  }

  setMood(mood: Mood) {
    this.head.classList.toggle("listening", mood === "listening");
    this.head.classList.toggle("thinking", mood === "thinking");
  }

  /** Small panel (while typing, or when the user shrinks it): zoom out so eyes and mouth both fit. */
  setCompact(compact: boolean) {
    this.el.querySelector("svg")?.setAttribute("viewBox", compact ? "-45 152 510 222" : "10 95 400 340");
  }

  nod() {
    this.head.classList.remove("nod");
    void this.head.getBoundingClientRect(); // restart the animation if it's already running
    this.head.classList.add("nod");
  }

  private loop() {
    if (this.raf) return;
    const step = (now: number) => {
      if (this.faking) {
        const s = now / 1000;
        this.target = {
          open: 0.12 + 0.6 * Math.abs(Math.sin(s * 9.1) * Math.sin(s * 3.7)),
          wide: 0.3 * Math.sin(s * 2.3),
        };
      }
      // Ease towards the target so the mouth moves smoothly rather than snapping.
      this.cur.open += (this.target.open - this.cur.open) * 0.38;
      this.cur.wide += (this.target.wide - this.cur.wide) * 0.3;
      this.apply();
      const settled =
        !this.faking && !this.visemes && this.cur.open < 0.01 && Math.abs(this.cur.wide) < 0.01;
      if (settled) {
        this.cur = { open: 0, wide: 0 };
        this.apply();
        this.raf = 0;
        return;
      }
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  private apply() {
    const { open, wide } = this.cur;
    const sxMouth = 1 + 0.07 * wide;
    const sxInner = 1 + 0.12 * wide;
    const syInner = 0.08 + 0.92 * open;
    this.mouth.setAttribute("transform", `translate(${CX} ${LIP_LINE}) scale(${sxMouth} 1) translate(${-CX} ${-LIP_LINE})`);
    this.inner.setAttribute("transform", `translate(${CX} ${LIP_LINE}) scale(${sxInner} ${syInner}) translate(${-CX} ${-LIP_LINE})`);
    this.lower.setAttribute("transform", `translate(0 ${(7 * open).toFixed(2)})`);
    this.upper.setAttribute("transform", `translate(0 ${(-1.1 * open).toFixed(2)})`);
  }
}
