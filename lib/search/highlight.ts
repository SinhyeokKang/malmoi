type Range = { start: number; end: number };

/** Lowercasing may expand a character; every folded offset maps back to a whole code point. */
function matchRanges(text: string, tokens: readonly string[]): Range[] {
  const starts: number[] = [];
  const ends: number[] = [];
  let offset = 0;
  for (const char of text) {
    for (let i = 0; i < char.toLowerCase().length; i++) {
      starts.push(offset);
      ends.push(offset + char.length);
    }
    offset += char.length;
  }
  // Fold the whole string to preserve contextual casing (e.g. Greek final sigma).
  const folded = text.toLowerCase();
  const ranges: Range[] = [];
  for (const raw of tokens) {
    const token = raw.toLowerCase();
    if (token === "") continue;
    let at = folded.indexOf(token);
    while (at !== -1) {
      const start = starts[at];
      const end = ends[at + token.length - 1];
      if (start !== undefined && end !== undefined) ranges.push({ start, end });
      at = folded.indexOf(token, at + 1);
    }
  }
  const merged: Range[] = [];
  for (const range of ranges.sort((a, b) => a.start - b.start || a.end - b.end)) {
    const prev = merged.at(-1);
    if (prev && range.start <= prev.end) prev.end = Math.max(prev.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

export function highlightSegments(text: string, tokens: readonly string[]): { text: string; match: boolean }[] {
  const ranges = matchRanges(text, tokens);
  if (ranges.length === 0) return [{ text, match: false }];
  const segments: { text: string; match: boolean }[] = [];
  let offset = 0;
  for (const { start, end } of ranges) {
    if (start > offset) segments.push({ text: text.slice(offset, start), match: false });
    segments.push({ text: text.slice(start, end), match: true });
    offset = end;
  }
  if (offset < text.length) segments.push({ text: text.slice(offset), match: false });
  return segments;
}

export function snippet(body: string, tokens: readonly string[], width: number): string | null {
  // Preserve literal matches for Highlight; normal browser whitespace renders them on one line.
  const text = body;
  const first = matchRanges(text, tokens)[0];
  if (!first) return null;
  const size = Math.max(1, Math.floor(width), first.end - first.start);
  let start = Math.max(0, first.start - Math.floor((size - (first.end - first.start)) / 2));
  let end = Math.min(text.length, start + size);
  start = Math.max(0, end - size);
  // Widen a boundary inside a surrogate pair rather than dropping half the character.
  if (start > 0 && /[\uDC00-\uDFFF]/.test(text[start] ?? "")) start--;
  if (end < text.length && /[\uDC00-\uDFFF]/.test(text[end] ?? "")) end++;
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}
