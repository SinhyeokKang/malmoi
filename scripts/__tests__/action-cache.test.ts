import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * **composite action v2의 셋업 계약** (action-run-cache). 셸·YAML이라 순수 함수가 없다 — 그래서 `action.yml`을
 * 파싱해 스텝의 모양을 센다. 셸 감지 분기(packageManager·storeDir)는 여기서 못 재고 폐기용 리포 run이 잰다.
 *
 * ⚠️ 이 셋이 틀리면 대상 리포 CI가 **우리 캐시 때문에** red가 된다:
 * - `pnpm/action-setup`의 캐시 키는 `hashFiles`라 워크스페이스 밖 lockfile(`action_path`)을 못 본다 → 빈 해시로 던진다.
 * - 그 복원이 `pnpm store path`를 대상 리포에서 돌아 yarn/npm 리포·`storeDir` 리포에서 던진다 → 감지해서 끈다.
 * - `setup-node` v7의 자동 캐시가 대상 리포 `package.json`을 읽는다 → 명시로 끈다.
 */

type Step = { name?: string; id?: string; if?: string; uses?: string; run?: string; shell?: string; env?: Record<string, unknown>; with?: Record<string, unknown> };

const action = parse(readFileSync(join(".github", "actions", "malmoi-i18n-push", "action.yml"), "utf8")) as { runs: { steps: Step[] } };
const steps = action.runs.steps;
const GUARD = "steps.guard.outputs.skip != 'true'";

const indexOfUses = (prefix: string) => steps.findIndex((s) => s.uses?.startsWith(`${prefix}@`));
const pnpmAt = indexOfUses("pnpm/action-setup");
const nodeAt = indexOfUses("actions/setup-node");
const pnpmStep = steps[pnpmAt];
const nodeStep = steps[nodeAt];

/** `${{ steps.<id>.outputs.<name> }}` → id. 캐시 입력이 어느 스텝의 출력인지 이름에 기대지 않고 따라간다. */
function outputRef(value: unknown, output: string): string | undefined {
  if (typeof value !== "string") return undefined;
  return new RegExp(`^\\$\\{\\{\\s*steps\\.([\\w-]+)\\.outputs\\.${output}\\s*\\}\\}$`).exec(value.trim())?.[1];
}

describe("전제 — 스위트가 실제로 스텝을 본다 (POSTMORTEM 2026-09-10)", () => {
  it("스텝이 있고 셋업 action이 각각 정확히 하나다", () => {
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.filter((s) => s.uses?.startsWith("pnpm/action-setup@"))).toHaveLength(1);
    expect(steps.filter((s) => s.uses?.startsWith("actions/setup-node@"))).toHaveLength(1);
    expect(steps[0]?.id).toBe("guard");
  });
});

describe("pnpm store 캐시 — 워크스페이스 안 복사본을 키로 쓴다", () => {
  const prepId = outputRef(pnpmStep?.with?.cache, "cache");
  const prepAt = steps.findIndex((s) => s.id === prepId);

  it("`cache`가 준비 스텝의 출력이다 — 대상 리포에 따라 끌 수 있어야 한다", () => {
    expect(prepId).toBeDefined();
    expect(prepAt).toBeGreaterThanOrEqual(0);
  });

  it("`cache_dependency_path`가 같은 준비 스텝의 경로 출력이다", () => {
    expect(outputRef(pnpmStep?.with?.cache_dependency_path, "path")).toBe(prepId);
  });

  it("준비가 셋업 앞이고 bash다", () => {
    expect(prepAt).toBeLessThan(pnpmAt);
    expect(steps[prepAt]?.shell).toBe("bash");
  });

  it("복사본 삭제가 셋업 뒤이고 `always()`로 돈다 — 셋업이 실패해도 대상 리포 워크스페이스에 남지 않는다", () => {
    // 경로는 env로 받는다(이 파일의 관례 — `${{ }}`를 스크립트에 보간하지 않는다). 지울 것은 준비가 만든 디렉터리(`dir`)뿐이다.
    const removeAt = steps.findIndex((s) => JSON.stringify(s).includes(`steps.${prepId}.outputs.dir`) && s.run?.includes("rm -rf") === true);
    expect(removeAt).toBeGreaterThan(pnpmAt);
    expect(steps[removeAt]?.if).toContain("always()");
    expect(steps[removeAt]?.if).toContain(GUARD);
  });

  it("정리가 준비의 디렉터리만 지운다 — 경로는 env로 받고 워크스페이스 접두사를 확인한다", () => {
    const remove = steps.find((s) => JSON.stringify(s).includes(`steps.${prepId}.outputs.dir`) && s.run?.includes("rm -rf") === true);
    const envName = Object.entries(remove?.env ?? {}).find(([, v]) => outputRef(v, "dir") === prepId)?.[0];
    expect(envName).toBeDefined();
    // `${{ }}`를 스크립트에 보간하지 않는다 — 이 파일의 관례다.
    expect(remove?.run).not.toContain("${{");
    expect(remove?.run).toContain(`"$GITHUB_WORKSPACE"/.malmoi-i18n-cache.*) rm -rf -- "$${envName}"`);
  });

  it("준비가 판정을 `detect-cache.cjs`에 맡긴다 — 단위 테스트가 보는 그 파일이다", () => {
    expect(steps[prepAt]?.run).toContain("detect-cache.cjs");
  });

  it("`run_install`을 주지 않는다 — install은 말모이 lockfile 옆에서 우리가 돈다", () => {
    expect(pnpmStep?.with).not.toHaveProperty("run_install");
  });
});

describe("setup-node — 대상 리포 `package.json`을 읽지 않는다", () => {
  it("`package-manager-cache`가 false다", () => {
    expect(nodeStep?.with?.["package-manager-cache"]).toBe(false);
  });

  it("`cache` 입력을 주지 않는다", () => {
    expect(nodeStep?.with).not.toHaveProperty("cache");
  });
});

describe("가드·설치", () => {
  it("가드 뒤 모든 스텝이 `[skip-malmoi-i18n]` 가드를 든다 — composite에는 job 수준 if가 없다", () => {
    const unguarded = steps.slice(1).filter((s) => !s.if?.includes(GUARD)).map((s) => s.name ?? s.id ?? s.uses);
    expect(unguarded).toEqual([]);
  });

  it("`pnpm install`에 `--frozen-lockfile`이 남아 있다 — 캐시가 설치 결과를 바꾸면 안 된다", () => {
    const install = steps.filter((s) => s.run?.includes("pnpm install") === true);
    expect(install).toHaveLength(1);
    expect(install[0]?.run).toContain("--frozen-lockfile");
  });
});
