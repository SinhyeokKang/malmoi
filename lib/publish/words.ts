export type WordPart = { text: string; changed: boolean };
/** 긴 값이 제곱 크기 행렬을 만들지 않도록 선형 메모리로 공통 단어열을 찾는다. */
export function diffWords(before: string, after: string): { before: WordPart[]; after: WordPart[] } {
  const tokenize = (value: string) => value.match(/\s+|[^\s]+/gu) ?? [];
  const a = tokenize(before), b = tokenize(after);
  function lengths(x: string[], y: string[]) {
    const row = new Uint32Array(y.length + 1);
    for (const token of x) {
      let previous = 0;
      for (let j = 1; j <= y.length; j++) {
        const old = row[j]!;
        row[j] = token === y[j - 1] ? previous + 1 : Math.max(row[j]!, row[j - 1]!);
        previous = old;
      }
    }
    return row;
  }
  function lcs(x: string[], y: string[]): string[] {
    if (!x.length || !y.length) return [];
    if (x.length === 1) return y.includes(x[0]!) ? [x[0]!] : [];
    const mid = Math.floor(x.length / 2);
    const left = lengths(x.slice(0, mid), y), right = lengths(x.slice(mid).reverse(), [...y].reverse());
    let split = 0;
    for (let j = 1; j <= y.length; j++) if (left[j]! + right[y.length - j]! > left[split]! + right[y.length - split]!) split = j;
    return [...lcs(x.slice(0, mid), y.slice(0, split)), ...lcs(x.slice(mid), y.slice(split))];
  }
  const common = lcs(a, b);
  function mark(tokens: string[]) { let i = 0; return tokens.map(text => { const changed = text !== common[i]; if (!changed) i++; return { text, changed }; }); }
  return { before: mark(a), after: mark(b) };
}
