import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * hand-rolled 컨트롤이 포커스 링 셋을 들었는지 **소스에서** 센다 (DESIGN §7).
 *
 * ⚠️ **화면이 늘 때마다 다시 샌다.** 2026-09-06에 버튼 4곳이 없어서 한 번 고쳤고, 2026-09-07
 * `/doc-check`이 설정 화면의 "연결 해제"에서 같은 것을 또 잡았다 — 그 사이 DESIGN §7은 규칙이
 * 지켜진 상태로 서술하고 있었다. **shadcn 생성 컴포넌트를 안 쓰므로 "기본값"이 지켜 주지 않고**,
 * 키보드 사용자에게만 보이는 결함이라 눈으로는 두 번 다 놓쳤다.
 *
 * `credential-separation`·`entry-points`·`globals-css`와 같은 계열의 상시 방어선이다.
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** DESIGN §7의 셋. 하나라도 빠지면 링이 안 보이거나 브라우저 기본 outline만 남는다. */
const RING = ["focus-visible:ring-ring", "focus-visible:ring-[3px]", "focus-visible:outline-none"];

/**
 * ⚠️ `components/ui/`는 제외한다 — shadcn 생성물이고 앱에서 import 0곳이다(UI 동결, MVP §8.3).
 * CLI 재실행이 덮으므로 여기서 강제하면 생성물과 싸우게 된다.
 */
const SKIP = new Set(["ui", "__tests__", "node_modules"]);

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".") || SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/**
 * `<button` / `<input`의 여는 태그 하나를 통째로 떼어낸다.
 *
 * 정규식으로 `>`까지 자르면 `onClick={() => {…}}`의 화살표에서 잘린다. 중괄호 깊이와 따옴표
 * 상태를 보면서 **깊이 0의 `>`** 를 찾는 것이 유일하게 맞는 방법이다.
 */
function openingTag(src: string, start: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (quote !== null) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return src.slice(start, i + 1);
  }
  return src.slice(start);
}

/** 포커스를 받을 수 있는 hand-rolled 컨트롤. `type="hidden"`은 포커스 대상이 아니다. */
function controls(src: string): string[] {
  const found: string[] = [];
  for (const m of src.matchAll(/<(?:button|input)[\s>]/g)) {
    const tag = openingTag(src, m.index);
    if (!tag.includes('type="hidden"')) found.push(tag);
  }
  return found;
}

const FILES = [...tsxFiles(join(ROOT, "components")), ...tsxFiles(join(ROOT, "app"))];

describe("hand-rolled 컨트롤의 포커스 링 (DESIGN §7)", () => {
  it("검사 대상 파일을 실제로 찾는다", () => {
    // 글롭이 조용히 0건이 되면 이 테스트가 항상 green이 된다 — 방어선이 아니라 장식이 된다.
    expect(FILES.length).toBeGreaterThan(0);
  });

  it("button·input 전부가 포커스 링 셋을 든다", () => {
    const missing: string[] = [];
    for (const file of FILES) {
      const src = readFileSync(file, "utf8");
      for (const tag of controls(src)) {
        if (RING.every((cls) => tag.includes(cls))) continue;
        const rel = file.slice(ROOT.length);
        const label = /className="([^"]*)"/.exec(tag)?.[1] ?? tag.slice(0, 60);
        missing.push(`${rel}: ${label}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("셋 중 하나만 빠져도 잡는다 — 스캐너가 red를 낼 수 있는지", () => {
    // 이 테스트 자신이 무력해지는 것을 막는다 (credential-separation의 메타 테스트와 같은 이유).
    const fake = `<button className="rounded focus-visible:ring-ring focus-visible:ring-[3px]">x</button>`;
    const [tag] = controls(fake);
    expect(tag).toBeDefined();
    expect(RING.every((cls) => tag?.includes(cls))).toBe(false);
  });

  it("여는 태그를 화살표 함수에서 자르지 않는다", () => {
    const fake = `<button onClick={() => setX(1)} className="focus-visible:outline-none">x</button>`;
    const [tag] = controls(fake);
    expect(tag).toContain("focus-visible:outline-none");
  });

  /**
   * ⚠️ **`<select>`가 방어선 밖이었다** (2026-09-07 `/doc-check`). 온보딩이 셀렉트를 도입했는데
   * 스캐너는 `button|input`만 봤다 — 그 셀렉트는 마침 링을 들고 있었지만 **그건 운이고 검사가
   * 아니었다.** `<textarea>`도 같은 부류다(아직 코드에 없지만 번역 UI 재작성이 쓸 수 있다).
   *
   * 포커스를 받는 컨트롤이 늘 때마다 이 목록이 낡으므로, 아래가 **네 태그를 각각 먹여** 스캐너가
   * 실제로 집는지 본다.
   */
  it("포커스를 받는 네 태그를 다 집는다 — button·input·select·textarea", () => {
    const fake = [
      `<button className="a">x</button>`,
      `<input className="b" />`,
      `<select className="c"><option>1</option></select>`,
      `<textarea className="d" />`,
    ].join("\n");
    const labels = controls(fake).map((t) => /className="([^"]*)"/.exec(t)?.[1]);
    expect(labels).toEqual(["a", "b", "c", "d"]);
  });
});
