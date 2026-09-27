import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * **composite action v2의 셋업 계약** (action-run-cache). 셸·YAML이라 순수 함수가 없다 — 그래서 `action.yml`을
 * 파싱해 스텝의 모양을 센다.
 *
 * ⚠️ **pnpm store 캐시는 재서 버렸다** (2026-09-27 T1, docs/ACTIONS.md "실행 시간") — 적중해도 292 MB 복원이 pnpm 스텝을
 * 늘려 v1 대비 ~0.7초였고, 한 job에서 action을 두 번 부르면(표면 둘) 빈 store가 저장돼 고정됐다. 여기서 "캐시가 없다"를 박는다.
 * ⚠️ `setup-node` v7의 자동 캐시는 **대상 리포 `package.json`**을 읽는다 → 명시로 끈다.
 */

type Step = { name?: string; id?: string; if?: string; uses?: string; run?: string; with?: Record<string, unknown> };

const action = parse(readFileSync(join(".github", "actions", "malmoi-i18n-push", "action.yml"), "utf8")) as { runs: { steps: Step[] } };
const steps = action.runs.steps;
const GUARD = "steps.guard.outputs.skip != 'true'";

const pnpmStep = steps.find((s) => s.uses?.startsWith("pnpm/action-setup@"));
const nodeStep = steps.find((s) => s.uses?.startsWith("actions/setup-node@"));

describe("전제 — 스위트가 실제로 스텝을 본다 (POSTMORTEM 2026-09-10)", () => {
  it("스텝이 있고 셋업 action이 각각 정확히 하나다", () => {
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.filter((s) => s.uses?.startsWith("pnpm/action-setup@"))).toHaveLength(1);
    expect(steps.filter((s) => s.uses?.startsWith("actions/setup-node@"))).toHaveLength(1);
    expect(steps[0]?.id).toBe("guard");
  });
});

describe("캐시 없음 — 재서 버린 결정", () => {
  it("`pnpm/action-setup`의 `cache`가 없거나 false다", () => {
    expect([undefined, false]).toContain(pnpmStep?.with?.cache);
    expect(pnpmStep?.with).not.toHaveProperty("cache_dependency_path");
  });

  it("`run_install`을 주지 않는다 — install은 말모이 lockfile 옆에서 우리가 돈다", () => {
    expect(pnpmStep?.with).not.toHaveProperty("run_install");
  });

  it("`setup-node`의 `package-manager-cache`가 false이고 `cache` 입력이 없다 — 대상 리포 `package.json`을 읽지 않는다", () => {
    expect(nodeStep?.with?.["package-manager-cache"]).toBe(false);
    expect(nodeStep?.with).not.toHaveProperty("cache");
  });
});

describe("가드·설치", () => {
  it("가드 뒤 모든 스텝이 `[skip-malmoi-i18n]` 가드를 든다 — composite에는 job 수준 if가 없다", () => {
    const unguarded = steps.slice(1).filter((s) => !s.if?.includes(GUARD)).map((s) => s.name ?? s.id ?? s.uses);
    expect(unguarded).toEqual([]);
  });

  it("`pnpm install`에 `--frozen-lockfile`이 남아 있다", () => {
    const install = steps.filter((s) => s.run?.includes("pnpm install") === true);
    expect(install).toHaveLength(1);
    expect(install[0]?.run).toContain("--frozen-lockfile");
  });
});
