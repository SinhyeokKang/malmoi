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
/**
 * ⚠️ **`className={cn(…)}`까지 본다** (라운드 3 ⚪) — 첫 판이 정적 속성만 읽어 리포의 `cn(` **76곳**을
 * 통째로 놓쳤고, `count-cards.tsx` 자신이 그중 셋을 쓴다. 속성값이 `{`로 열리면 **짝을 세어** 끝까지
 * 삼킨 뒤 그 안의 문자열 리터럴을 전부 후보로 본다.
 * ⚠️ **주석의 예시를 세면 스캐너가 거짓을 낸다** — 그래서 문자열 리터럴만 본다.
 */
const CLASS_ATTR = /className=(?:("[^"]*")|(\{))/g;
/**
 * ⚠️ **백틱에서 `$`를 배제하지 않는다** — 그러면 `className={`a ${b}`}` 형 **7곳**이 빈 문자열이 되어
 * 사각에 들어간다(그중 하나가 이 규칙이 지키려는 화면의 `loading.tsx`다). 보간 조각은 클래스 이름이
 * 아니므로 같이 딸려와도 `@container` 판정을 흔들지 않는다.
 */
const STRING_LITERAL = /"([^"]*)"|'([^']*)'|`([^`]*)`/g;

/** `className={…}`의 균형 잡힌 중괄호 안쪽. 못 닫으면 빈 문자열이다. */
function braced(source: string, open: number): string {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") { depth -= 1; if (depth === 0) return source.slice(open + 1, i); }
  }
  return "";
}

/** 한 요소의 className이 담은 클래스 문자열들. */
function classValues(source: string): string[] {
  const out: string[] = [];
  for (const match of source.matchAll(CLASS_ATTR)) {
    if (match[1] !== undefined) { out.push(match[1].slice(1, -1)); continue; }
    const inner = braced(source, match.index + match[0].length - 1);
    // 한 요소 안의 조각은 결국 한 className으로 합쳐지므로 **합쳐서** 본다.
    out.push([...inner.matchAll(STRING_LITERAL)].map((m) => m[1] ?? m[2] ?? m[3] ?? "").join(" "));
  }
  return out;
}

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

/** `@[672px]/cards:` → `cards`. 이름 없는 `@md:`는 가장 가까운 컨테이너를 묻는 것이라 대상이 아니다. */
function queriedNames(value: string): string[] {
  return [...value.matchAll(/(?:^|\s)@(?:\[[^\]]+\]|[\w-]+)\/([\w-]+):/g)].map((m) => m[1] ?? "");
}
function declaredNames(value: string): string[] {
  return [...value.matchAll(/(?:^|\s)@container\/([\w-]+)(?=\s|$)/g)].map((m) => m[1] ?? "");
}

const SOURCES = FILES.map((file) => ({ file: file.slice(ROOT.length + 1), values: classValues(readFileSync(file, "utf8")) }));

it("스캐너가 실제로 매칭한다 — 파일도 컨테이너 선언도 0이 아니다", () => {
  expect(FILES.length).toBeGreaterThan(50);
  // ⚠️ `cn(…)`을 못 읽던 첫 판은 이 수가 리포 실제보다 훨씬 작았다.
  expect(SOURCES.reduce((n, s) => n + s.values.length, 0)).toBeGreaterThan(200);
  // ⚠️ **템플릿 className도 실제로 읽히나** — 백틱 분기가 `$`를 배제하던 판은 이 수가 0이었다.
  expect(SOURCES.filter((s) => s.values.some((v) => v.includes("motion-safe:animate-pulse"))).length).toBeGreaterThan(0);
  expect(SOURCES.filter((s) => s.values.some((v) => DECLARES.test(v))).length).toBeGreaterThan(0);
});

it("컨테이너 선언과 그 컨테이너를 묻는 변형이 같은 요소에 있지 않다", () => {
  const offenders: string[] = [];
  for (const { file, values } of SOURCES) {
    for (const value of values) {
      if (DECLARES.test(value) && QUERIES.test(value)) offenders.push(`${file}: ${value.trim()}`);
    }
  }
  expect(offenders).toEqual([]);
});

/**
 * ⚠️ **이름을 물었는데 그 이름을 선언한 자리가 아예 없는 경우도 같은 증상이다** (라운드 3 ⚪) —
 * 오타 한 글자면 변형이 영영 안 맞고 화면은 좁은 기본값으로 멀쩡해 보인다. 조상 관계까지는 안 보고
 * **리포 어딘가에 그 이름이 선언돼 있나**만 센다: 조상이 아닌 자리에 있으면 위 검사가 잡는다.
 */
it("묻는 컨테이너 이름이 전부 어딘가에 선언돼 있다", () => {
  const declared = new Set(SOURCES.flatMap((s) => s.values.flatMap(declaredNames)));
  const orphans: string[] = [];
  for (const { file, values } of SOURCES) {
    for (const value of values) {
      for (const name of queriedNames(value)) if (!declared.has(name)) orphans.push(`${file}: @…/${name}:`);
    }
  }
  expect(orphans).toEqual([]);
});
