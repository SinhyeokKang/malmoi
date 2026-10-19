/**
 * DB·화면에서 문자 <는 &lt;로 남는다(결정 14). 원시 꺾쇠는 태그 문법을 따라야 한다.
 */
export function androidInlineTagsMatch(base: string, value: string): boolean {
  return androidInlineTagsIssue(base, value) === null;
}

export type AndroidInlineTagsIssue = "inline-tags-mismatch" | "inline-markup-invalid";

export function androidInlineTagsIssue(base: string, value: string): AndroidInlineTagsIssue | null {
  const expected = inlineTags(base);
  // 기준 셀 자체는 편집 가능하다. 잘못된 기준 때문에 모든 번역 저장이 막히지 않도록 토큰만 비교한다.
  if (expected === null) return sameTags(tagShapedTokens(base), tagShapedTokens(value)) ? null : "inline-tags-mismatch";
  const actual = inlineTags(value);
  if (actual === null) return "inline-markup-invalid";
  return sameTags(expected, actual) ? null : "inline-tags-mismatch";
}

function sameTags(expected: string[], actual: string[]): boolean {
  return expected.length === actual.length && expected.every((tag, index) => tag === actual[index]);
}

function tagShapedTokens(text: string): string[] {
  return (text.match(/<\/?[:_\p{L}](?:"[^"]*"|'[^']*'|[^<>"'])*>/gu) ?? []).sort();
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
    if (name === undefined) return null;
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
