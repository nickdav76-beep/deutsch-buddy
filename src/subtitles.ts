/** One spoken word: where it sits in the text and when it is heard (seconds). */
export type WordTiming = { offset: number; length: number; start: number; end: number };

/** A piece of the displayed sentence; `word` is the index into the timings, or null for spaces/punctuation. */
export type Segment = { text: string; word: number | null };

/**
 * Split the reply into word spans the player can light up.
 * Offsets from the speech service are trusted only when they point at the right word;
 * otherwise the word is searched for just after the previous one.
 */
export function alignWords(text: string, raw: { text: string; offset: number; start: number; end: number }[]): WordTiming[] {
  const out: WordTiming[] = [];
  let cursor = 0;
  for (const w of raw) {
    if (!w.text) continue;
    let at = text.substr(w.offset, w.text.length) === w.text && w.offset >= cursor ? w.offset : text.indexOf(w.text, cursor);
    if (at < 0) continue; // a word the text doesn't contain (rare SSML quirk): skip it
    out.push({ offset: at, length: w.text.length, start: w.start, end: w.end });
    cursor = at + w.text.length;
  }
  return out;
}

export function buildSegments(text: string, words: WordTiming[]): Segment[] {
  const segs: Segment[] = [];
  let pos = 0;
  words.forEach((w, i) => {
    if (w.offset > pos) segs.push({ text: text.slice(pos, w.offset), word: null });
    segs.push({ text: text.slice(w.offset, w.offset + w.length), word: i });
    pos = w.offset + w.length;
  });
  if (pos < text.length) segs.push({ text: text.slice(pos), word: null });
  return segs;
}

/** Index of the word being heard at time t (seconds), or -1 before the first word. */
export function activeWord(words: WordTiming[], t: number, lead = 0.05): number {
  let lo = 0;
  let hi = words.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].start <= t + lead) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** Index of the word containing a character position (for device voices, which report characters, not times). */
export function wordAtChar(words: { offset: number; length: number }[], charIndex: number): number {
  for (let i = words.length - 1; i >= 0; i--) if (words[i].offset <= charIndex) return i;
  return -1;
}

/** Plain word positions without timings, for the device-voice fallback. */
export function wordPositions(text: string): { offset: number; length: number }[] {
  const out: { offset: number; length: number }[] = [];
  const re = /[\p{L}\p{N}'’-]+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ offset: m.index, length: m[0].length });
  return out;
}
