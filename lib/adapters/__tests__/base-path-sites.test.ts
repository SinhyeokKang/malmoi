import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **`basePath` 표면에서 기준 언어 경로를 치환으로 만드는 자리가 0이다** (mobile-strings design §2 · 완료 조건 3).
 *
 * `pathTemplate.replaceAll("{locale}", code)`가 서버 코드에 흩어져 있고 그 대부분은 "모든 로케일" 루프라 기준 언어가 그 안에 있다 —
 * 기준 언어 전용 자리만 고치면 빠진다. 그래서 치환 자리를 **전수로 고정**하고 갈래마다 이유를 단다. 새 치환 자리가 생기면 이 표에
 * 없어서 red다: 그 자리가 기준 언어를 지나는지 판정해 표에 더한다.
 *
 * - `branched` — 기준 언어가 지나는 자리. 치환 줄(또는 바로 위 두 줄)이 `basePath`를 보고, 그 분기를 재는 동작 테스트가 `BEHAVIOR`에 묶인다.
 * - `change-row` — 언어 변경 행(ADD·REMOVE)만 지난다. 기준 언어는 변경 행이 될 수 없다(`change-plan.ts`가 `base-locale`로 거부하고
 *   추가는 `already-active`다) — 그래서 REMOVE가 `basePath`를 지우는 일이 구조상 없다(`lib/locales/__tests__/base-path.test.ts`가 고정한다).
 * - `adapter` — 어댑터 내부의 탐지 표본·쓰기 원본 조회. 기존 네 어댑터는 `basePath`를 내지 않는다. `basePath`를 내는 어댑터는 자기 판정을 든다.
 * - `helper` — `baseFilePath` 자신.
 * - `screen` — 화면 자리는 표시 문구가 함께 바뀌므로 android-strings T3.2b가 든다(design §2).
 */
type Kind = "branched" | "change-row" | "adapter" | "helper" | "screen";

const SITES: Record<string, { count: number; kind: Kind }> = {
  "lib/adapters/base-path.ts": { count: 1, kind: "helper" },

  "lib/pull/plan.ts": { count: 1, kind: "branched" },
  "lib/push/payload.ts": { count: 1, kind: "branched" },
  "lib/projects/remote-plan.ts": { count: 1, kind: "branched" },
  "lib/locales/change.ts": { count: 1, kind: "branched" },
  "lib/onboarding/detect.ts": { count: 1, kind: "branched" },
  "app/(edit)/projects/actions.ts": { count: 1, kind: "branched" },

  "lib/locales/add-plan.ts": { count: 1, kind: "change-row" },
  "lib/pull/locales.ts": { count: 1, kind: "change-row" },
  "lib/pull/run.ts": { count: 1, kind: "change-row" },

  "lib/adapters/chrome-locales.ts": { count: 1, kind: "adapter" },
  "lib/adapters/json-catalog.ts": { count: 1, kind: "adapter" },
  "lib/adapters/yaml-catalog.ts": { count: 2, kind: "adapter" },
  "lib/adapters/code-dict.ts": { count: 4, kind: "adapter" },
  "lib/adapters/shared.ts": { count: 1, kind: "adapter" },
  "lib/adapters/arb-catalog.ts": { count: 1, kind: "adapter" },

  // 다섯 자리가 파일 안 helper(`surveyLocalePath`) 하나로 모였고, 기준 언어 전용 diff 자리는 `baseFilePath`다.
  "lib/survey/one.ts": { count: 1, kind: "branched" },

  "components/onboarding/steps/base-locales.tsx": { count: 1, kind: "screen" },
  "components/sources/add-locale-dialog.tsx": { count: 1, kind: "screen" },
};

/**
 * **분기의 증거는 동작 테스트다** (review-B R1). 아래 "치환 곁에서 basePath를 본다"는 거친 그물이라, basePath를 *보기만* 하고 기준 언어가 아닌
 * 치환까지 내는 결함(R1 — `probeTargets`가 없는 `values-en/`을 겨눴다)을 통과시켰다. 그래서 `branched` 자리마다 그 함수를 basePath 픽스처로
 * 부르는 동작 테스트를 하나씩 묶는다 — 자리가 늘면 이 표도 늘어야 red가 풀린다.
 */
const BEHAVIOR: Record<string, { test: string; calls: string }> = {
  "lib/pull/plan.ts": { test: "lib/pull/__tests__/base-path.test.ts", calls: "resolveLocalePaths(" },
  "lib/push/payload.ts": { test: "lib/push/__tests__/base-path.test.ts", calls: "selectLocaleFiles(" },
  "lib/projects/remote-plan.ts": { test: "lib/projects/__tests__/base-path.test.ts", calls: "changedLocaleFileCount(" },
  "lib/locales/change.ts": { test: "lib/locales/__tests__/base-path.test.ts", calls: "surfacePaths(" },
  "lib/onboarding/detect.ts": { test: "lib/onboarding/__tests__/base-path-probe.test.ts", calls: "probeTargets(" },
  "app/(edit)/projects/actions.ts": { test: "app/(edit)/__tests__/onboarding.test.ts", calls: "loadCandidateSample(" },
  "lib/survey/one.ts": { test: "lib/survey/__tests__/base-path.test.ts", calls: "surveyLocalePath(" },
};

/** 기준 언어 하나만 다루는 자리 — 치환 대신 `baseFilePath`를 부른다(그래서 위 표에 없다). */
const BASE_ONLY = ["scripts/ingest.ts"];

const ROOTS = ["lib", "app", "scripts", "components"];
const SKIP = new Set(["__tests__", "node_modules", "generated"]);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name.startsWith(".") || SKIP.has(name)) return [];
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx?$/.test(name) && !/\.(test|integration)\.tsx?$/.test(name) ? [full] : [];
  });
}

/** 주석 속 언급은 세지 않는다. 줄 수는 지킨다 — 창(위 두 줄)을 줄 번호로 잰다. */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/gm, "$1");
}

const SUBSTITUTION = /\.replace(?:All)?\(\s*"\{locale\}"/g;

const scanned = () => ROOTS.flatMap(sources).map((path) => ({ path, text: code(path) }));

describe("치환 자리 전수", () => {
  it("스캐너가 실제로 파일을 걸었다 — 조용히 0건이 되지 않는다", () => {
    const files = scanned();
    expect(files.length).toBeGreaterThan(100);
    expect(files.some(({ path }) => path === "lib/pull/plan.ts")).toBe(true);
  });

  it("치환 자리가 확정 목록과 정확히 같다 — 새 자리는 기준 언어를 지나는지 판정해 표에 더한다", () => {
    const found: Record<string, number> = {};
    for (const { path, text } of scanned()) {
      const n = text.match(SUBSTITUTION)?.length ?? 0;
      if (n > 0) found[path] = n;
    }
    expect(found).toEqual(Object.fromEntries(Object.entries(SITES).map(([path, site]) => [path, site.count])));
  });

  it("기준 언어가 지나는 자리는 치환 바로 곁에서 basePath를 본다", () => {
    const misses: string[] = [];
    for (const [path, site] of Object.entries(SITES)) {
      if (site.kind !== "branched") continue;
      const lines = code(path).split("\n");
      lines.forEach((line, index) => {
        if (!new RegExp(SUBSTITUTION.source).test(line)) return;
        const window = lines.slice(Math.max(0, index - 2), index + 1).join("\n");
        if (!/basePath|baseFilePath/.test(window)) misses.push(`${path}:${index + 1}`);
      });
    }
    expect(misses).toEqual([]);
  });

  it("기준 언어가 지나는 자리마다 그 분기를 basePath 픽스처로 재는 동작 테스트가 있다", () => {
    const branched = Object.entries(SITES).filter(([, site]) => site.kind === "branched").map(([path]) => path).sort();
    expect(Object.keys(BEHAVIOR).sort()).toEqual(branched);
    for (const [site, { test, calls }] of Object.entries(BEHAVIOR)) {
      const text = readFileSync(test, "utf8");
      expect(text, `${site} → ${test}`).toContain(calls);
      expect(text, `${site} → ${test}`).toContain("basePath");
    }
  });

  it("기준 언어 하나만 다루는 자리는 baseFilePath를 부른다", () => {
    for (const path of BASE_ONLY) {
      const text = code(path);
      expect(text, path).toContain("baseFilePath(");
      expect(text.match(SUBSTITUTION) ?? [], path).toEqual([]);
    }
  });
});

/** `(`에서 짝 `)`까지 — 문자열 속 괄호는 이 리포의 prisma 호출에 없다. */
function balanced(text: string, open: number, left = "(", right = ")"): string {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === left) depth++;
    else if (text[i] === right && --depth === 0) return text.slice(open, i + 1);
  }
  return text.slice(open);
}

/**
 * **쓰는 자리 전수** (POSTMORTEM 2026-09-15 — 컬럼을 더하며 쓰는 자리를 전수로 안 세서 종료 경로 다섯 중 둘에만 붙었다). 표면 행에
 * `pathTemplate`을 쓰거나 그것으로 조건부 쓰기를 거는 호출은 `basePath`도 함께 다룬다 — 경로 설정의 한 짝이다.
 */
describe("TranslationSurface 쓰기 자리", () => {
  const WRITES: Record<string, number> = {
    "lib/push/apply.ts": 1,
    "lib/surfaces/create.ts": 2,
    "lib/onboarding-run/create.ts": 1,
    // 야간 실패 기록의 CAS — 설정이 그대로일 때만 쓴다.
    "lib/nightly/run.ts": 1,
  };

  const writes = () => scanned().flatMap(({ path, text }) =>
    [...text.matchAll(/translationSurface\.(?:create|createMany|update|updateMany|upsert)\(/g)].map((m) => ({
      path,
      call: balanced(text, (m.index ?? 0) + m[0].length - 1),
    })).filter(({ call }) => call.includes("pathTemplate")));

  it("pathTemplate을 다루는 쓰기 호출이 확정 목록과 같다", () => {
    const found: Record<string, number> = {};
    for (const { path } of writes()) found[path] = (found[path] ?? 0) + 1;
    expect(found).toEqual(WRITES);
  });

  it("그 호출이 전부 basePath도 다룬다", () => {
    expect(writes().filter(({ call }) => !call.includes("basePath")).map(({ path }) => path)).toEqual([]);
  });
});

/**
 * **명시 select도 짝으로 고른다** — 지문·경로 계산의 입력이 select로 좁혀 오면 `basePath`가 빠진 채 컴파일될 수 있다(입력 타입이
 * 넓을 때). 표시 전용 자리만 예외다.
 */
describe("TranslationSurface 명시 select", () => {
  const DISPLAY_ONLY = new Set([
    // MCP 소스 목록 응답 — 응답 계약에 basePath를 싣는 일은 android-strings가 든다.
    "lib/mcp/tools/project.ts",
    // Sources 화면 데이터 — 화면 자리는 android-strings T3.2b가 든다.
    "lib/sources/query.ts",
  ]);

  it("pathTemplate을 고르는 select가 basePath도 고른다", () => {
    const misses = scanned().flatMap(({ path, text }) => {
      if (DISPLAY_ONLY.has(path)) return [];
      return [...text.matchAll(/pathTemplate: true/g)].flatMap((m) => {
        const open = text.lastIndexOf("{", m.index ?? 0);
        return balanced(text, open, "{", "}").includes("basePath: true") ? [] : [path];
      });
    });
    expect(misses).toEqual([]);
  });

  it("표시 전용 예외가 실제로 pathTemplate을 고른다 — 지워진 예외가 남지 않는다", () => {
    for (const path of DISPLAY_ONLY) expect(code(path), path).toContain("pathTemplate: true");
  });
});
