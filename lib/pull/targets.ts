import { compareKeys } from "@/lib/adapters/shared";

import type { PullResult } from "./run";

/**
 * 야간 cron이 돌 프로젝트 고르기 (design §3.9). **순수 판정이다** — 조회는 라우트가 한다.
 *
 * ⚠️ **준비 안 된 프로젝트를 돌리면 던진다.** `installationId`가 null이면 `runPull`(`run.ts`)이,
 * 포맷 컬럼이 null이면 `formatFromProject`(`plan.ts`)가 던지고 — `loadPullState`는 프로젝트 부재만
 * `fail()`한다 — 그 실패가 매일 밤 로그를 채운다. 그래서 필터가 순회 앞에 선다.
 *
 * ⚠️ **`lastCommitSha`가 "첫 적재가 끝났다"의 증거다** (`planProjectReadiness`와 같은 두 컬럼이다 —
 * `lib/onboarding/readiness.ts`). 그쪽은 화면용 3갈래이고 여기는 대상 필터라 목적이 다르지만, 조건이
 * 갈리면 "화면은 준비됐다는데 cron이 안 돈다"가 된다.
 *
 * 순서가 `slug` 오름차순인 이유는 **결정성**이다 — 실패 지점을 재현하려면 도는 순서가 고정돼야 한다.
 * `localeCompare`가 아니라 `compareKeys`(코드 유닛)를 쓰는 것은 export 정렬과 같은 이유다.
 */
export function selectPullTargets(
  projects: readonly { slug: string; installationId: string | null; lastCommitSha: string | null }[],
): string[] {
  return projects
    .filter((p) => p.installationId !== null && p.lastCommitSha !== null)
    .map((p) => p.slug)
    .sort(compareKeys);
}

/**
 * cron 응답의 항목 하나. **계약을 타입으로 든다** — `unknown[]`이면 `slug`가 스프레드에 덮이거나
 * 실패 항목의 모양이 바뀌어도 컴파일러가 침묵한다 (POSTMORTEM 2026-08-31: 외부 계약을 리터럴로
 * 조립했다가 필수 필드가 늘어도 조용했다).
 *
 * `PullResult`에 `slug`가 없으므로 `{ slug, ...result }`가 slug를 덮을 수 없다 — 그 사실이 여기서
 * 타입으로 강제된다(생기면 교차 타입이 충돌한다).
 */
export type PullItem =
  | ({ slug: string } & PullResult)
  | { slug: string; status: "failed"; error?: string; ref?: string };
