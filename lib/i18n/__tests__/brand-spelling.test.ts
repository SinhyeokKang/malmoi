import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * **화면에 닿는 소스에서 제품 이름은 언제나 `malmoi`다** (CLAUDE.md — 코드·리포명·slug·도메인 표기).
 *
 * ⚠️ **이 검사가 생긴 이유는 한 화면에 두 표기가 같이 섰기 때문이다** (2026-09-13, `/design-sync`가
 * 캔버스를 읽다 잡았다): 계정 화면의 확인 Dialog가 `Disconnect GitHub from malmoi?`인데 바로 아래
 * 세션 Alert가 `...sign in to Malmoi...`였다. **둘 다 같은 사전에서 나온 값**이라 리뷰로는 안 걸린다 —
 * 서로 다른 절에 살아서 한 번에 눈에 들어오지 않는다.
 *
 * **문장 첫 자리도 소문자다.** 리포가 이미 그렇게 쓰고 있었다(`malmoi is ready` ·
 * `malmoi didn't find any on …`) — 이름이 도메인(`mal-moi.com`)과 같은 형이라 문장 위치가 표기를
 * 바꾸지 않는다.
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

function scanned(): { path: string; wrong: string[] }[] {
  return [...ROOTS.flatMap((root) => sourceFiles(join(ROOT, root))), ...ROOT_FILES.map((f) => join(ROOT, f))]
    .map((file) => relative(ROOT, file))
    .map((path) => ({
      path,
      // ⚠️ **`malmoi`를 대소문자 무시로 찾은 뒤 정확 일치만 걸러낸다** — `Mal-moi`·`MALMOI` 같은
      // 다른 변형도 같은 규칙을 어기는 것이고, 패턴을 `Malmoi` 하나로 박으면 그것들이 조용히 통과한다.
      wrong: (stripComments(readFileSync(join(ROOT, path), "utf8")).match(/malmoi/gi) ?? []).filter((m) => m !== "malmoi"),
    }));
}

describe("제품 이름 표기는 malmoi 하나다", () => {
  it("스캐너가 실제로 파일을 걸었다 — 조용히 0건이 되지 않는다", () => {
    expect(scanned().length).toBeGreaterThan(50);
  });

  it("이름을 실제로 든 파일이 있다 — 패턴이 아무것도 안 맞으면 이 검사는 장식이다", () => {
    const carrying = scanned().filter(({ path }) => /malmoi/i.test(stripComments(readFileSync(join(ROOT, path), "utf8"))));
    expect(carrying.length).toBeGreaterThan(0);
  });

  it("벗기기가 주석 안의 표기를 세지 않는다", () => {
    expect(stripComments("/** Malmoi 앱 */ const a = 1;")).not.toMatch(/Malmoi/);
    expect(stripComments("// Malmoi 앱\nconst a = 1;")).not.toMatch(/Malmoi/);
  });

  it("소스 어디에도 malmoi 아닌 표기가 없다", () => {
    const offenders = scanned().filter(({ wrong }) => wrong.length > 0).map(({ path, wrong }) => `${path}: ${wrong.join(", ")}`);
    expect(offenders).toEqual([]);
  });
});
