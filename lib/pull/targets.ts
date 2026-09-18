import { compareKeys } from "@/lib/adapters/shared";
import { planProjectReadiness } from "@/lib/onboarding/readiness";

import type { PullResult } from "./run";

/**
 * 야간 cron이 돌 프로젝트 고르기 (ARCHITECTURE §3.05). **순수 판정이다** — 조회는 라우트가 한다.
 *
 * ⚠️ **준비 안 된 프로젝트를 돌리면 던진다.** `installationId`·`repositoryId`가 null이면
 * `triggerPull`의 `createClient`가, `runPull`(`run.ts`)이,
 * 포맷 컬럼이 null이면 `formatFromProject`(`plan.ts`)가 던지고 — `loadPullState`는 프로젝트 부재만
 * `fail()`한다 — 그 실패가 매일 밤 로그를 채운다. 그래서 필터가 순회 앞에 선다.
 *
 * ⚠️ **`lastCommitSha`가 "첫 적재가 끝났다"의 증거다** (`planProjectReadiness`와 같은 두 컬럼이다 —
 * `lib/onboarding/readiness.ts`). 그쪽은 화면용 3갈래이고 여기는 대상 필터라 목적이 다르지만, 조건이
 * 갈리면 "화면은 준비됐다는데 cron이 안 돈다"가 된다.
 *
 * ⚠️ **보관된 프로젝트는 여기서 빠진다** (7단계) — 순회 대상이 아니므로 게이트까지 가지도 않고,
 * `unprocessed`로도 세지 않는다. "못 돈 것"이 아니라 "안 도는 것"이라 그 수에 섞으면 상한 경보가 거짓이 된다.
 *
 * ⚠️ **순서가 취향이 아니라 아사 대책이다** (7단계 — sync-runs spec 비목표 "재시도 큐"). 전에는
 * `slug` 오름차순이라, `PULL_BATCH_LIMIT`에서 잘리는 뒤쪽이 **매일 밤 같은 프로젝트**였다 —
 * 그 프로젝트는 영원히 안 돈다. `project-onboarding/design.md`가 "7단계 `SyncRun`이 큐로 가른다"고
 * 넘긴 자리이고, 여기서 **큐 없이 정렬로** 푼다: 마지막 실행이 가장 오래된 것부터, 한 번도 안 돈
 * 프로젝트가 맨 앞, **동점은 slug**(결정성은 그대로 지킨다 — `localeCompare`가 아니라 `compareKeys`다).
 *
 * @param projects 라우트의 `select` 결과 그대로다 — `syncRuns`는 `take: 1, orderBy: { startedAt: desc }`로
 *   읽은 **최근 하나**이고, 판정층이 그것을 재조립하지 않는다.
 */
export function selectPullTargets(
  projects: readonly {
    slug: string;
    installationId: string | null;
    /**
     * ⚠️ **sec-audit-2 발견 34 전에 만들어진 행은 전부 null이다.** 그런 행은 `createClient`가
     * 확실히 던지므로 순회에 남기면 **재연결 전까지 매일 밤 실패 `SyncRun`이 쌓인다** — 설정
     * 화면이 `not-connected`로 할 일을 말하는 동안 `/logs`는 실패로 채워진다.
     */
    repositoryId: string | null;
    surfaces: readonly { archivedAt: Date | null; lastCommitSha: string | null }[];
    archivedAt: Date | null;
    syncRuns: readonly { startedAt: Date }[];
  }[],
  limit: number,
): { targets: string[]; unprocessed: number } {
  const ready = projects
    .filter((p) => planProjectReadiness(p) === "ready" && p.repositoryId !== null && p.archivedAt === null)
    .slice()
    .sort((a, b) => {
      // 한 번도 안 돈 프로젝트를 `-Infinity`로 둔다 — "가장 오래 안 돌았다"가 그 뜻이다.
      const at = a.syncRuns[0]?.startedAt.getTime() ?? -Infinity;
      const bt = b.syncRuns[0]?.startedAt.getTime() ?? -Infinity;
      return at === bt ? compareKeys(a.slug, b.slug) : at - bt;
    })
    .map((p) => p.slug);
  // ⚠️ **자르기는 정렬 뒤다** — 잘린 뒤쪽이 실행 기록 없이 남으므로 다음 밤에는 앞으로 온다.
  return { targets: ready.slice(0, limit), unprocessed: Math.max(0, ready.length - limit) };
}

/**
 * 한 번의 cron이 도는 프로젝트 수 상한 (2026-09-09, sec-audit 발견 26).
 *
 * ⚠️ **상한이 잘림을 없애지 않는다 — 시끄럽게 만든다.** 전에는 준비된 전 프로젝트를 직렬로 돌았고,
 * `maxDuration = 60`을 넘으면 slug 정렬 **뒤쪽이 통째로 안 돌았다.** 응답은 항상 200 배열이라 cron
 * 실행은 성공으로 표시되고 요약에도 그 사실이 없어, **관측값이 정상과 같았다**(POSTMORTEM 2026-09-06의
 * 형태). 지금은 못 돈 수가 응답과 로그에 실린다 — 거기 닿으면 그때 cron 분할을 본다.
 */
export const PULL_BATCH_LIMIT = 50;

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
