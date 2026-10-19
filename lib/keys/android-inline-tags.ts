import { androidValueTags } from "@/lib/adapters/android-strings";

export function androidInlineTagsMatch(base: string, value: string): boolean {
  return androidInlineTagsIssue(base, value) === null;
}

export type AndroidInlineTagsIssue = "inline-tags-mismatch" | "inline-markup-invalid";

export function androidInlineTagsIssue(base: string, value: string): AndroidInlineTagsIssue | null {
  // 저장과 writer가 같은 문법을 써야 저장 뒤 Publish에서 처음 실패하는 셀이 생기지 않는다.
  const actual = androidValueTags(value);
  if (actual === undefined) return "inline-markup-invalid";
  const expected = androidValueTags(base);
  // 깨진 옛 기준 값에는 비교 가능한 태그 집합이 없다. 새 값의 쓰기 가능성은 위에서 항상 검사한다.
  if (expected === undefined) return null;
  const a = tagMultiset(actual);
  const b = tagMultiset(expected);
  return a.length === b.length && a.every((tag, index) => tag === b[index]) ? null : "inline-tags-mismatch";
}

/** 문법·짝 검증은 끝났다. 어순·속성 순서·따옴표 종류는 번역에서 달라질 수 있어 비교할 표현만 정규화한다. */
function tagMultiset(tags: readonly string[]): string[] {
  return tags.filter(tag => !tag.startsWith("</")).map(tag => {
    const name = /^<([^\s/>]+)/.exec(tag)![1]!;
    const attributes = [...tag.slice(name.length + 1).matchAll(/([^\s=]+)\s*=\s*(["'])(.*?)\2/gs)]
      .map(match => JSON.stringify([match[1], match[3]])).sort();
    return JSON.stringify([name, tag.endsWith("/>"), attributes]);
  }).sort();
}
