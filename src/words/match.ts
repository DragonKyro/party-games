// Typed-guess checking (Sketch & Guess, and anywhere else a typed answer is
// compared with a secret). Forgiving on purpose: case, accents, punctuation,
// spacing, a leading article and a plural "s" don't matter. "Close" guesses
// (one or two typos away) get a private nudge instead of credit.

export function normalizeGuess(raw: string): string {
  return String(raw)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[-_/.]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(a|an|the) /, '');
}

function compact(s: string): string {
  return normalizeGuess(s).replace(/ /g, '');
}

function depluralize(s: string): string {
  if (s.length > 4 && s.endsWith('ies')) return `${s.slice(0, -3)}y`;
  if (s.length > 3 && s.endsWith('es')) return s.slice(0, -2);
  if (s.length > 2 && s.endsWith('s')) return s.slice(0, -1);
  return s;
}

export function isCorrectGuess(guess: string, answer: string): boolean {
  const g = compact(guess);
  const a = compact(answer);
  if (!g || !a) return false;
  if (g === a) return true;
  return depluralize(g) === depluralize(a) || depluralize(g) === a || g === depluralize(a);
}

/** Levenshtein distance, early exit above `max`. */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

export function isCloseGuess(guess: string, answer: string): boolean {
  if (isCorrectGuess(guess, answer)) return false;
  const g = compact(guess);
  const a = compact(answer);
  if (g.length < 3 || a.length < 3) return false;
  const allowed = a.length <= 5 ? 1 : 2;
  return editDistance(g, a, allowed) <= allowed;
}

/** True if `text` gives the answer away (contains it, ignoring spacing/case). */
export function containsAnswer(text: string, answer: string): boolean {
  const a = compact(answer);
  return a.length >= 3 && compact(text).includes(a);
}

/** Letter positions that can be revealed as hints (letters and digits only). */
export function hintableIndexes(answer: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < answer.length; i++) if (/[\p{L}\p{N}]/u.test(answer[i]!)) out.push(i);
  return out;
}

/**
 * The blanked-out answer: letters become "_" unless revealed; spaces and
 * punctuation show as-is so word lengths are visible ("_ _ _   _ _ _ _").
 * Returned as an array of cells so the UI can lay it out.
 */
export function hintCells(answer: string, revealed: readonly number[] = []): string[] {
  const shown = new Set(revealed);
  return [...answer].map((ch, i) => (/[\p{L}\p{N}]/u.test(ch) && !shown.has(i) ? '_' : ch));
}
