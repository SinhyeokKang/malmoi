import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { isTeardownOnlyFailure, planGate } from "../gate-plan";

/**
 * **로컬 게이트는 한 명령이다** (2026-09-30 — nightly-sync 오케스트레이션). 지휘자가 `pnpm test | grep | head`로 게이트를 손으로 조립해
 * 파이프가 종료 코드를 삼켰고, 29건 red가 dev에 나갔다. 단계 목록·격리 postgres 트리거를 여기 한 곳에 둔다.
 */
const BASE = ["db:generate", "typecheck", "test", "build", "sync:agents:check"];

describe("planGate", () => {
  it("트리거 경로를 안 건드리면 격리 postgres 스위트를 돌지 않는다", () => {
    expect(planGate(["components/home/meta-column.tsx", "docs/ARCHITECTURE.md"])).toEqual(BASE);
  });

  it("projects 트리거를 건드리면 test 뒤·build 앞에 test:projects:postgres가 선다", () => {
    expect(planGate(["lib/import/run.ts"])).toEqual(["db:generate", "typecheck", "test", "test:projects:postgres", "build", "sync:agents:check"]);
  });

  it.each([
    "lib/oauth-server/token.ts",
    "lib/oauth-server/authorize.ts",
    "lib/oauth-server/revoke.ts",
    "lib/keys/source-counts.ts",
    "lib/events/view.ts",
    "lib/push/apply.ts",
    "lib/pull/targets.ts",
    "lib/nightly/run.ts",
    "lib/home/runs.ts",
    "app/(edit)/actions.ts",
    "app/api/push/route.ts",
    "app/api/pull/route.ts",
    "app/api/mcp/route.ts",
    "prisma/migrations/20260930015436_add_project_last_nightly_at/migration.sql",
    "vitest.projects.config.ts",
  ])("%s → test:projects:postgres", (path) => {
    expect(planGate([path])).toContain("test:projects:postgres");
  });

  it("파일 단위 트리거는 그 파일만 잡는다 — 이웃 파일은 아니다", () => {
    expect(planGate(["lib/push/guard.ts"])).not.toContain("test:projects:postgres");
    expect(planGate(["lib/auth/cookie.ts"])).not.toContain("test:projects:postgres");
  });

  it("lib/credentials를 건드리면 test:credentials:postgres가 선다", () => {
    expect(planGate(["lib/credentials/rotate.ts"])).toEqual(["db:generate", "typecheck", "test", "test:credentials:postgres", "build", "sync:agents:check"]);
  });

  it("둘 다 건드리면 둘 다 — projects가 먼저다", () => {
    expect(planGate(["lib/credentials/rotate.ts", "lib/import/run.ts"])).toEqual([
      "db:generate",
      "typecheck",
      "test",
      "test:projects:postgres",
      "test:credentials:postgres",
      "build",
      "sync:agents:check",
    ]);
  });

  it("변경 목록을 못 구했으면(null) 격리 스위트 둘 다 돈다 — 모르면 좁히지 않는다", () => {
    expect(planGate(null)).toEqual(["db:generate", "typecheck", "test", "test:projects:postgres", "test:credentials:postgres", "build", "sync:agents:check"]);
  });

  /**
   * ⚠️ **include에 디렉터리를 더했는데 트리거에 안 더하면 그 통합 테스트가 게이트에서 영영 안 돈다** (POSTMORTEM 2026-09-10의 형태) —
   * 설정 파일을 읽어 include의 디렉터리마다 트리거가 잡히는지 잰다.
   */
  it("vitest.projects.config.ts의 include 디렉터리마다 그 아래 파일이 트리거된다", () => {
    const config = readFileSync(join(__dirname, "../../vitest.projects.config.ts"), "utf8");
    const dirs = [...config.matchAll(/"([^"]+)\/__tests__\/\*\.integration\.ts"/g)].map((m) => m[1]);
    expect(dirs.length).toBeGreaterThan(5);
    for (const dir of dirs) {
      expect(planGate([`${dir}/__tests__/x.integration.ts`]), dir).toContain("test:projects:postgres");
    }
  });
});

describe("isTeardownOnlyFailure", () => {
  const summary = (files: string, tests: string, extra = "") =>
    `${extra}\n Test Files  ${files}\n      Tests  ${tests}\n     Errors  1 error\n`;

  it("테스트는 전부 통과했고 워커 종료 오류만 있으면 true", () => {
    const out = `⎯⎯⎯ Unhandled Errors ⎯⎯⎯\nEnvironmentTeardownError: [vitest-worker]: Closing rpc while "onUserConsoleLog" was pending${summary("590 passed (590)", "8499 passed (8499)")}`;
    expect(isTeardownOnlyFailure(out)).toBe(true);
  });

  it("실패한 테스트가 하나라도 있으면 false", () => {
    const out = `EnvironmentTeardownError: x${summary("1 failed | 589 passed (590)", "29 failed | 8470 passed (8499)")}`;
    expect(isTeardownOnlyFailure(out)).toBe(false);
  });

  it("종료 오류가 아닌 다른 unhandled error면 false", () => {
    const out = `⎯⎯⎯ Unhandled Errors ⎯⎯⎯\nTypeError: boom${summary("590 passed (590)", "8499 passed (8499)")}`;
    expect(isTeardownOnlyFailure(out)).toBe(false);
  });

  it("요약 줄이 없으면(러너가 죽었으면) false", () => {
    expect(isTeardownOnlyFailure("EnvironmentTeardownError: x\n")).toBe(false);
  });
});
