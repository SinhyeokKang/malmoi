import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { servedGuideFiles } from "@/lib/guide/__tests__/helpers/served";

/**
 * **화면에 닿는 문구에서 제품 이름은 `Malmoi`이고, 식별자에서는 `malmoi`다** (2026-09-26 사용자 결정 —
 * 그 전까지는 화면도 소문자 `malmoi` 하나였다).
 *
 * ⚠️ **이 검사가 생긴 이유는 한 화면에 두 표기가 같이 섰기 때문이다** (2026-09-13, `/design-sync`가
 * 캔버스를 읽다 잡았다): 계정 화면의 확인 Dialog와 바로 아래 세션 Alert가 서로 다른 표기였다.
 * **둘 다 같은 사전에서 나온 값**이라 리뷰로는 안 걸린다 — 서로 다른 절에 살아서 한 번에 눈에 들어오지 않는다.
 *
 * **둘을 가르는 것은 이웃 글자다.** `-`·`/`·`.`·`_`·`:`·`@`가 붙으면 식별자다 — 쿠키 이름(`malmoi-gh-state`)·
 * 암호 문맥(`malmoi/pii`)·로컬 저장 키(`malmoi.translation-draft`)·브랜치·리포 경로. ⚠️ **식별자를 대문자로
 * 올리면 안 되는 이유가 저장된 값이다** — 암호 문맥 문자열이 바뀌면 이미 저장된 봉투를 못 연다.
 * 그 밖의 홀로 선 낱말은 문장 첫 자리든 가운데든 `Malmoi`다.
 *
 * ⚠️ **주석은 벗기고 센다.** 주석은 한국어로 쓰고 거기서는 고유명사를 자유롭게 적는다 —
 * `no-korean-ui.test.ts`와 같은 이유이고 **같은 벗기기**를 쓴다.
 */

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));

const ROOTS = ["app", "components", "lib", "messages"];
const ROOT_FILES = ["auth.ts", "middleware.ts"];
const SKIP_DIR = new Set(["__tests__", "node_modules", "generated"]);

/**
 * ⚠️ **`no-korean-ui.test.ts`의 것과 같은 구현이고, 거기가 정본이다**(메타 테스트 셋이 그 파일에 있다).
 * import로 가져오지 않는 이유: 테스트 모듈을 테스트 모듈에서 import하면 그쪽 `describe`가 **여기에도
 * 등록되어 같은 검사가 두 번 돈다.**
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/gm, "$1");
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".") || SKIP_DIR.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** 이웃이 이 글자면 식별자다. */
const IDENT_NEIGHBOR = /[-/._:@]/;

/**
 * ⚠️ **뒤의 `.`·`:`는 그 뒤에 글자가 이어질 때만 식별자다** — `malmoi.translation-draft`·`malmoi:onboarding`과
 * 문장 끝 `…on Malmoi. The link…`·`Closed by Malmoi: the…`가 같은 글자로 갈린다.
 */
function identAfter(next: string, nextNext: string): boolean {
  if (next === "." || next === ":") return /[\w-]/.test(nextNext);
  return IDENT_NEIGHBOR.test(next);
}

/**
 * 홀로 선 소문자인데 식별자로 남는 자리 — **화면에 안 닿는다.** GitHub API가 요구하는 `User-Agent` 값이라
 * 대소문자가 뜻이 없고, 바꿀 이유도 없다.
 */
const IDENT_EXCEPTIONS = new Set(['"User-Agent": "malmoi"']);

/** 한 파일의 위반 목록 — 규칙 자체를 아래 메타 테스트가 고정한다. */
function brandViolations(source: string): string[] {
  const wrong: string[] = [];
  for (const m of source.matchAll(/malmoi/gi)) {
    const i = m.index;
    const before = source[i - 1] ?? "";
    const after = source[i + m[0].length] ?? "";
    const afterAfter = source[i + m[0].length + 1] ?? "";
    // ⚠️ `malmoi`를 대소문자 무시로 찾은 뒤 판정한다 — `MALMOI`·`MalMoi` 같은 변형도 같은 규칙을 어긴다.
    const ident = IDENT_NEIGHBOR.test(before) || identAfter(after, afterAfter);
    if (ident ? m[0] === "malmoi" : m[0] === "Malmoi") continue;
    if (m[0] === "malmoi" && [...IDENT_EXCEPTIONS].some((e) => source.slice(Math.max(0, i - e.length), i + e.length).includes(e))) continue;
    wrong.push(JSON.stringify(source.slice(Math.max(0, i - 20), i + 26)));
  }
  return wrong;
}

/**
 * **서빙되는 원고**(`servedGuideFiles`) — ⚠️ md에서는 `stripComments`를 건너뛴다. 글롭의 `/*`가 블록 주석
 * 시작으로 먹혀 그 뒤 본문이 사라진다(`no-korean-ui.test.ts`와 같은 이유).
 */
function guideScanned(root: string): { path: string; wrong: string[] }[] {
  const dir = join(root, "guide");
  return servedGuideFiles(dir).map((file) => ({ path: relative(root, join(dir, file)), wrong: brandViolations(readFileSync(join(dir, file), "utf8")) }));
}

function scanned(): { path: string; wrong: string[] }[] {
  return [
    ...[...ROOTS.flatMap((root) => sourceFiles(join(ROOT, root))), ...ROOT_FILES.map((f) => join(ROOT, f))]
      .map((file) => relative(ROOT, file))
      .map((path) => ({ path, wrong: brandViolations(stripComments(readFileSync(join(ROOT, path), "utf8"))) })),
    ...guideScanned(ROOT),
  ];
}

describe("제품 이름 표기 — 화면은 Malmoi, 식별자는 malmoi", () => {
  it("스캐너가 실제로 파일을 걸었다 — 조용히 0건이 되지 않는다", () => {
    expect(scanned().length).toBeGreaterThan(50);
    expect(scanned().filter(({ path }) => path.startsWith("guide/") && path.endsWith(".md")).length).toBeGreaterThanOrEqual(1);
  });

  it("이름을 실제로 든 파일이 있다 — 패턴이 아무것도 안 맞으면 이 검사는 장식이다", () => {
    const carrying = scanned().filter(({ path }) => /Malmoi/.test(stripComments(readFileSync(join(ROOT, path), "utf8"))));
    expect(carrying.length).toBeGreaterThan(0);
  });

  it("벗기기가 주석 안의 표기를 세지 않는다", () => {
    expect(stripComments("/** malmoi 앱 */ const a = 1;")).not.toMatch(/malmoi/);
    expect(stripComments("// malmoi 앱\nconst a = 1;")).not.toMatch(/malmoi/);
  });

  it("홀로 선 낱말은 Malmoi여야 한다 — 문장 첫 자리도 가운데도", () => {
    expect(brandViolations('"malmoi is ready"')).toHaveLength(1);
    expect(brandViolations('"Sign in to malmoi"')).toHaveLength(1);
    expect(brandViolations("malmoi's action")).toHaveLength(1);
    expect(brandViolations('"a project on malmoi. The link"')).toHaveLength(1);
    expect(brandViolations('"Closed by malmoi: the DB"')).toHaveLength(1);
    expect(brandViolations('"a project on Malmoi. The link" "Closed by Malmoi: the DB"')).toEqual([]);
    expect(brandViolations('"Malmoi is ready" "Sign in to Malmoi" Malmoi\'s')).toEqual([]);
  });

  it("식별자는 malmoi로 남아야 한다 — 저장 값·쿠키·경로가 여기 걸린다", () => {
    expect(brandViolations('"malmoi/pii" "malmoi-gh-state" `malmoi.translation-draft` "malmoi:onboarding-sample:v1" SinhyeokKang/malmoi')).toEqual([]);
    expect(brandViolations('"Malmoi/pii"')).toHaveLength(1);
    expect(brandViolations('"Malmoi-gh-state"')).toHaveLength(1);
  });

  it("다른 변형은 어느 자리에서도 틀리다", () => {
    expect(brandViolations('"MALMOI" "MalMoi"')).toHaveLength(2);
  });

  it("GitHub User-Agent 값은 예외다 — 화면에 안 닿는다", () => {
    expect(brandViolations('"User-Agent": "malmoi",')).toEqual([]);
  });

  it("소스 어디에도 규칙을 어긴 표기가 없다", () => {
    const offenders = scanned().filter(({ wrong }) => wrong.length > 0).map(({ path, wrong }) => `${path}: ${wrong.join(", ")}`);
    expect(offenders).toEqual([]);
  });
});

describe("원고 스캔 — 서빙되는 md만, 주석 벗기기 없이", () => {
  const FIXTURE = fileURLToPath(new URL("../../guide/__tests__/fixtures/scan", import.meta.url));
  const formats = () => guideScanned(FIXTURE).find(({ path }) => path === "guide/formats.md")?.wrong ?? [];

  it("SUMMARY에 오른 md만 훑는다 — 한국어 AUTHORING·SHOOTING은 틀린 표기를 들어도 무시된다", () => {
    expect(guideScanned(FIXTURE).map(({ path }) => path)).toEqual(["guide/SUMMARY.md", "guide/formats.md"]);
  });

  it("글롭 `/*` 뒤의 `MALMOI`가 잡힌다 — 벗기기를 건너뛰었다는 증거", () => {
    const source = readFileSync(join(FIXTURE, "guide/formats.md"), "utf8");
    expect(brandViolations(stripComments(source)).some((hit) => hit.includes("MALMOI"))).toBe(false);
    expect(formats().some((hit) => hit.includes("MALMOI"))).toBe(true);
  });

  it("`//…` 뒤의 홀로 선 소문자도 잡힌다 — 줄 주석 벗기기를 건너뛰었다는 증거", () => {
    const source = readFileSync(join(FIXTURE, "guide/formats.md"), "utf8");
    expect(brandViolations(stripComments(source)).some((hit) => hit.includes("then malmoi"))).toBe(false);
    expect(formats().some((hit) => hit.includes("then malmoi"))).toBe(true);
  });
});
