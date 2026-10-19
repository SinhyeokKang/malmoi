/**
 * DB·화면 값은 XML 문서가 아니다 — 일반 텍스트의 <·&와 엔티티 표기를 다시 디코딩하지 않는다.
 * 태그만 세고 닫힘을 검사한다. 어순에 따라 태그 위치는 바뀔 수 있지만 이름·속성·개수는 보존해야 한다.
 */
export function androidInlineTagsMatch(base: string, value: string): boolean {
  const expected = inlineTags(base);
  const actual = inlineTags(value);
  return expected !== null && actual !== null
    && expected.length === actual.length && expected.every((tag, index) => tag === actual[index]);
}

const NAME = /[:_\p{L}][:_\p{L}\p{N}\p{M}.\-]*/uy;
const SPACE = /[ \t\r\n]/;

function inlineTags(text: string): string[] | null {
  const tags: string[] = [];
  const stack: string[] = [];
  let cursor = 0;
  const nameAt = (): string | undefined => {
    NAME.lastIndex = cursor;
    const name = NAME.exec(text)?.[0];
    if (name !== undefined) cursor += name.length;
    return name;
  };
  const spaces = () => { while (cursor < text.length && SPACE.test(text[cursor]!)) cursor++; };
  while (cursor < text.length) {
    const start = text.indexOf("<", cursor);
    if (start < 0) break;
    // CDATA와 주석처럼 보이는 텍스트 안의 꺾쇠는 자식 태그가 아니다.
    const endMarker = text.startsWith("<![CDATA[", start) ? "]]>" : text.startsWith("<!--", start) ? "-->" : null;
    if (endMarker !== null) {
      const end = text.indexOf(endMarker, start + 4);
      if (end < 0) return null;
      cursor = end + endMarker.length;
      continue;
    }
    cursor = start + 1;
    const closing = text[cursor] === "/";
    if (closing) cursor++;
    const name = nameAt();
    if (name === undefined) {
      if (closing) return null;
      continue;
    }
    if (closing) {
      spaces();
      if (text[cursor++] !== ">" || stack.pop() !== name) return null;
      continue;
    }
    const attributes = new Map<string, string>();
    let selfClosing = false;
    while (true) {
      const before = cursor;
      spaces();
      if (text.startsWith("/>", cursor)) { cursor += 2; selfClosing = true; break; }
      if (text[cursor] === ">") { cursor++; break; }
      if (cursor === before) return null;
      const attribute = nameAt();
      if (attribute === undefined || attributes.has(attribute)) return null;
      spaces();
      if (text[cursor++] !== "=") return null;
      spaces();
      const quote = text[cursor++];
      if (quote !== '"' && quote !== "'") return null;
      const end = text.indexOf(quote, cursor);
      if (end < 0) return null;
      const value = text.slice(cursor, end);
      if (value.includes("<")) return null;
      attributes.set(attribute, value);
      cursor = end + 1;
    }
    tags.push(JSON.stringify([name, selfClosing, [...attributes].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)]));
    if (!selfClosing) stack.push(name);
  }
  return stack.length === 0 ? tags.sort() : null;
}
