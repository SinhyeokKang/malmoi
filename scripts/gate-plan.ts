/**
 * 로컬 게이트의 **판정** — 무엇을 어떤 순서로 돌리나, 실패가 재시도할 만한가. 껍데기는 `scripts/gate.ts`(`pnpm gate`)다.
 *
 * ⚠️ **게이트를 손으로 조립하지 않는다** (2026-09-30 — nightly-sync 오케스트레이션). `pnpm test | grep | head`로 건 게이트는
 * 파이프가 종료 코드를 삼켜 29건 red를 dev에 내보냈다. 단계 목록과 격리 postgres 트리거의 정본이 이 파일이다 — CLAUDE.md·스킬은
 * 경로를 나열하지 않고 `pnpm gate`를 부른다.
 */

export type GateStep =
  | "db:generate"
  | "typecheck"
  | "test"
  | "test:projects:postgres"
  | "test:credentials:postgres"
  | "build"
  | "sync:agents:check";

/**
 * `pnpm test`에 없는 격리 PostgreSQL 스위트와 그것을 부르는 경로. `/`로 끝나면 그 아래 전부, 아니면 그 파일 하나다.
 * ⚠️ `vitest.projects.config.ts` include에 디렉터리를 더하면 여기에도 더한다 — 테스트가 설정을 읽어 대조한다.
 */
const POSTGRES_SUITES: readonly { step: GateStep; triggers: readonly string[] }[] = [
  {
    step: "test:projects:postgres",
    triggers: [
      "lib/__tests__/",
      "lib/invitation-email/",
      "lib/auth/lock.ts",
      "lib/sync/run.ts",
      "lib/keys/",
      "lib/events/",
      "lib/surfaces/",
      "lib/push/apply.ts",
      "lib/pull/",
      "lib/publish/",
      "lib/import/",
      "lib/protection/",
      "lib/nightly/",
      "lib/home/",
      "lib/mcp/",
      "lib/onboarding-run/",
      // 상한 재집계(복원·승격·수락)와 운영자 판정 — 동시 복원·생성 시나리오가 `lib/keys/`에 있다.
      "lib/projects/owner-limit.ts",
      "lib/projects/archive.ts",
      "lib/operator/",
      "app/(edit)/actions.ts",
      "app/api/push/route.ts",
      "app/api/pull/",
      "app/api/mcp/",
      "prisma/migrations/",
      "vitest.projects.config.ts",
    ],
  },
  { step: "test:credentials:postgres", triggers: ["lib/credentials/", "vitest.credentials.config.ts"] },
];

function hits(path: string, trigger: string): boolean {
  return trigger.endsWith("/") ? path.startsWith(trigger) : path === trigger;
}

/** `changed`가 `null`이면 변경 목록을 못 구한 것이다 — 모르면 좁히지 않고 격리 스위트를 전부 돈다. */
export function planGate(changed: readonly string[] | null): GateStep[] {
  const suites = POSTGRES_SUITES.filter(
    (suite) => changed === null || changed.some((path) => suite.triggers.some((trigger) => hits(path, trigger))),
  ).map((suite) => suite.step);
  return ["db:generate", "typecheck", "test", ...suites, "build", "sync:agents:check"];
}

/**
 * vitest가 **테스트는 전부 통과했는데** 워커 종료 오류(`EnvironmentTeardownError`)로만 exit 1을 낸 경우 — 부하가 걸린 머신에서 나는
 * 러너 쪽 흔들림이라 한 번만 다시 돌린다. 실패한 테스트가 하나라도 있거나, 다른 unhandled error거나, 요약 줄이 없으면(러너가 죽었다) 아니다.
 */
export function isTeardownOnlyFailure(output: string): boolean {
  const files = /^\s*Test Files\s+(.+)$/m.exec(output)?.[1];
  const tests = /^\s*Tests\s+(.+)$/m.exec(output)?.[1];
  if (files === undefined || tests === undefined) return false;
  if (/\bfailed\b/.test(files) || /\bfailed\b/.test(tests)) return false;
  const errors = [...output.matchAll(/^(\w+Error):/gm)].map((m) => m[1]);
  return errors.length > 0 && errors.every((name) => name === "EnvironmentTeardownError");
}
