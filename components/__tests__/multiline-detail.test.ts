import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * **어댑터 오류를 렌더하는 자리는 개행을 보존해야 한다** — `AdapterError.detail`이 여러 줄일 수 있다.
 *
 * ⚠️ **YAML 파서가 개행과 캐럿 다이어그램을 넣는다** (2026-09-08 실물 `pnpm ingest`로 관측):
 * `Missing closing "quote at line 4, column 1:\n\n  retries: 3\n\n^\n`. `text-mono`에는 `white-space`
 * 규칙이 없어 HTML 기본값(`normal`)이 그 개행을 공백으로 접고, **캐럿이 가리키던 열이 의미를 잃는다.**
 * 값이 사라지는 것은 아니지만 읽으라고 접어 둔 진단이 읽을 수 없게 된다.
 *
 * ⚠️ **렌더 테스트가 아니라 소스 스캔인 이유**: 이 결함은 `detail`이 여러 줄인 갈래에서만 보이고,
 * 그것은 다섯 어댑터 중 `yaml-catalog` 하나다 — 정상 온보딩을 눈으로 훑어서는 원리적으로 안 보인다.
 * `focus-ring.test.ts`("키보드 사용자에게만 보이는 결함이라 눈으로 두 번 놓쳤다")와 같은 계열이다.
 *
 * **전수로 세는 것이 요지다** — 소비자가 늘어도 잡힌다. 지금 둘(`new-project-flow`·`first-ingest-retry`)이고
 * 6b-3의 화면이 셋째가 될 수 있다.
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** 개행을 보존하면서 줄바꿈은 계속 하는 유일한 값. `pre`는 긴 줄을 가로 스크롤로 만든다. */
const PRESERVE = "whitespace-pre-wrap";

const SKIP = new Set(["__tests__", "node_modules"]);

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
 * `adapterErrorMessage(...)`를 **렌더하는** 줄. import 줄은 뺀다.
 *
 * 여는 태그가 같은 줄에 있다는 전제인데, 그것이 이 리포의 모양이고
 * 아래 "0건 아님" 가드가 전제가 깨진 것을 신고한다.
 */
function renderSites(): { path: string; line: number; text: string }[] {
  const out: { path: string; line: number; text: string }[] = [];
  for (const file of [...tsxFiles(join(ROOT, "components")), ...tsxFiles(join(ROOT, "app"))]) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((text, i) => {
      if (!text.includes("adapterErrorMessage(")) return;
      if (/^\s*import\b/.test(text)) return;
      out.push({ path: relative(ROOT, file), line: i + 1, text });
    });
  }
  return out;
}

/**
 * ⚠️ **서버가 합쳐서 보내는 자리는 위 스캔이 원리적으로 못 본다.** `lib/pull/run.ts`가
 * `${path}: ${adapterErrorMessage(e)}`로 **문자열을 완성해** `PullResult.warnings`에 싣고, Publish의
 * `<details>`는 그 완성품을 받는다 — 그 컴포넌트에는 `adapterErrorMessage(`가 없다. 온보딩만 고치고
 * 이 자리를 놓치면 **번역자가 실제로 보는 쪽**이 안 고쳐진 채 검사가 green이다 (2026-09-08 code-review 🔴1).
 *
 * 그래서 **이름으로 고정한다** — `entry-points.test.ts`가 인가 예외를 이름으로 고정하고 그 이름이
 * 실재하는지도 보는 것과 같은 형이다. ⚠️ **목록 밖의 새 소비자는 이 검사가 못 잡는다**: `warnings`를
 * 받는 컴포넌트가 늘면 이 목록에 손으로 더해야 한다. 그 좁음을 여기 적어 두는 것이 목록의 대가다.
 */
const COMPOSED_SITES = [{ path: "components/publish-button.tsx", marker: "warnings.map(" }];

describe("서버가 합친 warnings를 렌더하는 자리도 개행을 접지 않는다", () => {
  it("고정한 파일과 마커가 실재한다 — 이름이 낡으면 검사가 조용해진다", () => {
    for (const { path, marker } of COMPOSED_SITES) {
      expect(readFileSync(join(ROOT, path), "utf8"), path).toContain(marker);
    }
  });

  it("마커 아래 렌더 블록이 개행을 보존한다", () => {
    const offenders = COMPOSED_SITES.filter(({ path, marker }) => {
      const lines = readFileSync(join(ROOT, path), "utf8").split("\n");
      const at = lines.findIndex((l) => l.includes(marker));
      return !lines.slice(at, at + 6).some((l) => l.includes(PRESERVE));
    }).map(({ path }) => path);
    expect(offenders).toEqual([]);
  });
});

describe("여러 줄 detail — 어댑터 오류를 렌더하는 자리가 개행을 접지 않는다", () => {
  it("렌더 자리를 실제로 걸었다 — 조용히 0건이 되지 않는다", () => {
    expect(renderSites().length).toBeGreaterThanOrEqual(2);
  });

  it("모든 렌더 자리가 개행을 보존한다", () => {
    const offenders = renderSites()
      .filter(({ text }) => !text.includes(PRESERVE))
      .map(({ path, line }) => `${path}:${line}`);
    expect(offenders).toEqual([]);
  });
});
