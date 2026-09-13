import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `SelectTrigger`의 접근 이름 방어선 (2026-09-13).
 *
 * ⚠️ **`role="combobox"`에는 name-from-content가 없다.** 트리거 안에 텍스트를 넣어도 접근 이름이
 * 서지 않는다 — 실측으로 `sr-only` span만 둔 트리거의 accname이 **빈 문자열**이었다. native
 * `<select>` 시절에는 `<label for>`가 그것을 대신했지만 트리거는 `<button>`이라 그 경로도 다르다.
 *
 * ⚠️ **렌더가 아니라 소스를 센다** — 이름이 빠진 자리는 화면에도 테스트에도 안 나타나고(3088개가
 * green이었다) 스크린리더에서만 "콤보박스"로 읽힌다. 여는 태그를 직접 세는 것이 유일하게 싼 방어선이다.
 *
 * ⚠️ **`<SelectTrigger` 리터럴만 본다.** 트리거를 로컬 래퍼 컴포넌트로 감싸면 그 호출부가 조용히
 * 검사 밖으로 나간다 — 래퍼를 만들 일이 생기면 그 래퍼 자신이 이름을 강제해야 한다.
 */
const ROOT = join(import.meta.dirname, "..", "..");

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (entry.endsWith(".tsx") && !full.includes("__tests__")) out.push(full);
  }
  return out;
}

const FILES = [...tsxFiles(join(ROOT, "components")), ...tsxFiles(join(ROOT, "app"))];

/** `<SelectTrigger …>` 여는 태그를 통째로 집는다 — 속성이 여러 줄에 걸쳐 있다. */
function triggers(source: string): string[] {
  return [...source.matchAll(/<SelectTrigger\b[^>]*>/gs)].map((match) => match[0]);
}

describe("콤보박스 접근 이름", () => {
  it("검사 대상 파일을 실제로 찾는다", () => {
    expect(FILES.length).toBeGreaterThan(0);
    expect(FILES.some((file) => triggers(readFileSync(file, "utf8")).length > 0)).toBe(true);
  });

  it("모든 `SelectTrigger`가 `aria-label`이나 `aria-labelledby`를 든다", () => {
    const nameless: string[] = [];
    for (const file of FILES) {
      for (const tag of triggers(readFileSync(file, "utf8"))) {
        if (!tag.includes("aria-label")) nameless.push(`${file.slice(ROOT.length + 1)}: ${tag.slice(0, 60)}`);
      }
    }
    expect(nameless).toEqual([]);
  });

  /**
   * ⚠️ **참조가 끊기면 이름이 값만 남거나 통째로 빈다.** `aria-label`은 자기완결이었지만
   * `aria-labelledby`는 **다른 노드에 의존**하므로 오타 하나로 조용히 무너진다 — 패턴을 바꾸면서
   * 새로 생긴 실패 모드라 여기서 닫는다.
   */
  it("`aria-labelledby`가 가리키는 라벨 id가 같은 파일에 실재한다", () => {
    const dangling: string[] = [];
    for (const file of FILES) {
      const source = readFileSync(file, "utf8");
      const tags = triggers(source);
      if (tags.length === 0) continue;
      /** `id=` · `labelId=`로 **선언된** 것 전부 — 템플릿 리터럴 표기도 문자열 그대로 집는다. */
      const declared = new Set(
        [...source.matchAll(/(?:\blabelId|\bid)=\{?["`]([^"`]+)["`]/g)].map((match) => match[1]!),
      );
      for (const tag of tags) {
        const labelledBy = /aria-labelledby=\{?["`]([^"`]+)["`]/.exec(tag);
        if (labelledBy === null) continue;
        const self = /\bid=\{?["`]([^"`]+)["`]/.exec(tag)?.[1];
        for (const token of labelledBy[1]!.split(/\s+/)) {
          if (token !== self && !declared.has(token)) dangling.push(`${file.slice(ROOT.length + 1)}: ${token}`);
        }
      }
    }
    expect(dangling).toEqual([]);
  });

  /**
   * ⚠️ **자기 id를 함께 가리켜야 값이 이름 뒤에 붙는다** (ARIA APG의 select-only combobox). 라벨만
   * 가리키면 스크린리더가 "Branch"까지만 말하고 고른 값을 말하지 않는다. ⚠️ **그 효과는 브라우저가
   * 내는 것이라 jsdom으로는 못 센다** — 여기서 세는 것은 **배선**뿐이다.
   */
  it("`aria-labelledby`를 쓰면 트리거 자신의 id도 가리킨다", () => {
    const broken: string[] = [];
    for (const file of FILES) {
      for (const tag of triggers(readFileSync(file, "utf8"))) {
        const labelledBy = /aria-labelledby=\{?["`]([^"`]+)["`]/.exec(tag);
        if (labelledBy === null) continue;
        const id = /\bid=\{?["`]([^"`]+)["`]/.exec(tag);
        if (id === null || !labelledBy[1]!.split(/\s+/).includes(id[1]!)) {
          broken.push(`${file.slice(ROOT.length + 1)}: ${tag.slice(0, 80)}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });
});
