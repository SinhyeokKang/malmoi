import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ADAPTERS } from "@/lib/adapters";
import { m } from "@/lib/i18n";

/**
 * 수동 지정의 Path 힌트가 **선택된 포맷의 layout에 따라** 갈리는지 센다.
 *
 * ⚠️ 이 스캔이 있는 이유: 힌트가 `{locale}` 자리표시자 한 문장으로 고정돼 있어 `ts-dict`(multi-locale —
 * 한 파일에 로케일이 나란히 있어 경로에 로케일이 없다)를 고르면 **틀린 안내**가 됐다. bugshot-2가
 * 정확히 그 경로였다(`_locales` 4키가 자동 탐지를 먹고, 903키 `ts-dict`로 가는 유일한 길이 수동 지정이다).
 *
 * 판정 자체는 타입이 든다(`satisfies Record<Layout, …>` + `PATH_HINTS[layout]` 인덱스) — 여기서 세는 것은
 * **화면이 그것을 실제로 쓰는가**다. `translations-screen`·`focus-ring`과 같은 계열이다.
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

const read = (path: string): string =>
  readFileSync(join(ROOT, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/gm, "$1");

describe("manual format hint", () => {
  it("사전이 어댑터 layout 갈래를 전부 든다", () => {
    const layouts = new Set(ADAPTERS.map((a) => a.layout));
    expect(layouts.size).toBeGreaterThan(1);
    expect(Object.keys(m.newProject.files.manual.pathHint).sort()).toEqual([...layouts].sort());
  });

  it("서버가 어댑터의 layout을 그대로 내려준다", () => {
    const src = read("app/(edit)/projects/new-project-modal.tsx");
    // 리터럴로 적으면 어댑터를 더할 때 조용히 틀린다 — 값의 출처가 `Adapter.layout` 하나여야 한다.
    expect(src).toMatch(/layout:\s*adapter\.layout/);
    expect(src).not.toMatch(/layout:\s*"(per|multi)-locale"/);
  });

  it("폼이 선택된 포맷으로 힌트·예시를 고른다", () => {
    const src = read("components/onboarding/steps/files.tsx");
    // 고정 호출(`pathHint(...)`)이면 `ts-dict`를 골라도 `{locale}` 문장이 그대로 남는다 —
    // 사전 값은 **layout으로 인덱스**해야 한다.
    expect(src).not.toMatch(/pathHint\(/);
    expect(src).toMatch(/PATH_HINTS\[[^\]]+layout[^\]]*\]/);
    // placeholder도 갈려야 한다 — `src/locales/{locale}.json` 하나면 multi-locale에서 틀린 예시다.
    expect(src).not.toMatch(/placeholder="src\/locales\/\{locale\}\.json"/);
  });
});
