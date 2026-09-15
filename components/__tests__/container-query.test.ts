import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

/**
 * **요소는 자기 자신의 쿼리 컨테이너가 될 수 없다.** CSS 컨테이너 쿼리는 **조상**만 평가한다(그래야
 * 폭이 자기 자신을 바꾸는 순환이 안 생긴다) — 그래서 `@container/x`와 `@[...]/x:`를 **같은 요소**에
 * 쓰면 그 변형은 **어떤 폭에서도 참이 되지 않는다.**
 *
 * ⚠️ **화면은 멀쩡해 보인다** — 좁은 쪽(기본값)이 그대로 서므로 "아직 임계값이 아닌가 보다"로 읽힌다.
 * 2026-09-15에 Home의 카운트 카드가 그 상태였다: `@container/cards … @[672px]/cards:grid-cols-4`가
 * 한 요소에 있어 **넷이 언제나 2×2**였고 캔버스 `2a`의 4열을 한 번도 안 밟았다. 도입 시점의 실측이
 * **패널 열린 531px**이라 그 폭에서는 2열이 맞는 답이었던 것이 겹쳐 아무도 의심하지 않았다.
 *
 * ⚠️ **폭을 재는 테스트로는 못 잡는다** — jsdom은 레이아웃이 없고, 브라우저로 재도 그 화면을 임계값
 * 위로 넓혀야만 드러난다. 그래서 **소스에서 센다.**
 */

const ROOT = join(import.meta.dirname, "..", "..");
const SKIP_DIR = new Set(["__tests__", "node_modules", "generated", ".next"]);

/** `@container` 또는 `@container/<name>` — 이 요소가 조상 컨테이너가 된다는 선언. */
const DECLARES = /(?:^|\s)@container(?:\/[\w-]+)?(?=\s|$)/;
/** `@md:`·`@[672px]/cards:` — 조상 컨테이너의 폭을 묻는 변형. 선언과 달리 `:`로 끝난다. */
const QUERIES = /(?:^|\s)@(?:\[[^\]]+\]|[\w-]+)(?:\/[\w-]+)?:/;
/** ⚠️ **className 문자열 리터럴만 본다** — 주석의 예시를 세면 스캐너가 거짓을 낸다. */
const CLASS_ATTR = /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/g;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".") || SKIP_DIR.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const FILES = ["components", "app"].flatMap((root) => sourceFiles(join(ROOT, root)));

it("스캐너가 실제로 매칭한다 — 파일도 컨테이너 선언도 0이 아니다", () => {
  expect(FILES.length).toBeGreaterThan(50);
  const declaring = FILES.filter((file) =>
    [...readFileSync(file, "utf8").matchAll(CLASS_ATTR)].some((m) => DECLARES.test(m[1] ?? m[2] ?? m[3] ?? "")),
  );
  expect(declaring.length).toBeGreaterThan(0);
});

it("컨테이너 선언과 그 컨테이너를 묻는 변형이 같은 요소에 있지 않다", () => {
  const offenders: string[] = [];
  for (const file of FILES) {
    for (const match of readFileSync(file, "utf8").matchAll(CLASS_ATTR)) {
      const value = match[1] ?? match[2] ?? match[3] ?? "";
      if (DECLARES.test(value) && QUERIES.test(value)) offenders.push(`${file.slice(ROOT.length + 1)}: ${value.trim()}`);
    }
  }
  expect(offenders).toEqual([]);
});
