export type Segment = { kind: "same" | "del" | "ins"; text: string };

const tokenize = (s: string) => s.trim().split(/\s+/).filter(Boolean);
// Compare words loosely so a trailing comma or capital letter doesn't hide a real match.
const norm = (w: string) => w.toLowerCase().replace(/[.,!?;:„“"']/g, "");

/** Word-level diff between what the learner wrote and the corrected sentence. */
export function wordDiff(original: string, corrected: string): Segment[] {
  const a = tokenize(original);
  const b = tokenize(corrected);
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);

  const out: Segment[] = [];
  const push = (kind: Segment["kind"], text: string) => {
    const last = out.at(-1);
    if (last && last.kind === kind) last.text += " " + text;
    else out.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push("same", b[j]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      push("del", a[i++]);
    } else {
      push("ins", b[j++]);
    }
  }
  while (i < n) push("del", a[i++]);
  while (j < m) push("ins", b[j++]);
  return out;
}

/** True when the two sentences differ only in punctuation or capitals. */
export function sameIgnoringPunctuation(a: string, b: string): boolean {
  const x = tokenize(a).map(norm).join(" ");
  const y = tokenize(b).map(norm).join(" ");
  return x === y;
}
