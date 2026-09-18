import type { PrismaClient } from "@/generated/prisma/client";

import { logFailure } from "./log";
import { ensureUserToken } from "./token-store";
import { listInstallationRepos, listUserInstallations } from "./user";

/**
 * `/account`의 GitHub App 행이 드는 **설치된 리포 수** (DESIGN §6.67).
 *
 * **판정은 `countInstalledRepos`, I/O는 `loadInstalledRepoCount`다.** 껍데기에는 단위 테스트가
 * 없다 — fetch 모킹 비용이 가치를 넘고, `user.ts`가 같은 이유로 그렇게 서 있다.
 */

/** 설치 하나의 조회 결과. **실패를 값으로 든다** — 하나가 403이어도 나머지는 세야 한다. */
export type InstallationReposResult = { repos: readonly { fullName: string }[] } | { error: unknown };

/**
 * 설치별 결과에서 유니크 리포 수. `null`이면 **"말할 수 없다"**이고 화면이 그 줄을 안 그린다.
 *
 * ⚠️ **`null`과 `0`은 다른 사실이다.** `0`을 내면 "선택된 리포가 없다"로 읽혀 사용자가 멀쩡한
 * 설치를 다시 만들러 간다 — 실패한 조회를 "없음"으로 읽으면 없는 것과 구별되지 않는다
 * (POSTMORTEM 2026-09-03 · `listConnectableRepos`의 같은 판단).
 *
 * ⚠️ **경계는 "리포 수"가 아니라 "읽었는가"다.** 빈 배열을 돌려준 설치는 **읽힌 것**이고, 그
 * 사실을 실패와 같은 값으로 접으면 화면이 두 상태를 구별하지 못한다.
 */
export function countInstalledRepos(settled: readonly InstallationReposResult[]): number | null {
  // ⚠️ **`fullName`으로 접는다.** 설치 둘에 같은 리포가 걸릴 수 있는데 `[...new Set(objects)]`는
  // 참조로 비교해 그 중복을 못 접는다 (`projects/actions.ts`가 같은 함정에 주석을 달아 두었다).
  const unique = new Set<string>();
  let read = 0;
  for (const item of settled) {
    if ("error" in item) continue;
    read += 1;
    for (const repo of item.repos) unique.add(repo.fullName);
  }
  // 설치가 0개인 것은 실패가 아니라 사실이라 `0`이다. 실패만 있을 때만 말할 수 없다.
  if (read === 0 && settled.length > 0) return null;
  return unique.size;
}

/**
 * ⚠️ **호출부가 `loadAccountView`와 병렬로 돌리면 안 된다** (2026-09-16 리뷰 🔴1). 이 함수도
 * `ensureUserToken`을 부르므로, 나란히 두면 둘이 **같은 마이크로태스크에서 같은 refresh 토큰을
 * 읽는다.** 만료였으면 둘 다 갱신을 시도하고 1회용이라 한쪽이 400을 받는데, 거부가 성공보다 빨리
 * 오면 진 쪽의 `afterRace`가 이긴 쪽의 쓰기보다 **먼저** 행을 읽어 `reauthorize`를 낸다.
 *
 * ⚠️ **`token-store.ts`의 조건부 쓰기가 그것을 막아 준다고 읽지 않는다** — 그 장치는 **탭 둘이
 * 따로 요청을 보내는** 순차 경합용이고, 거기서도 같은 창이 있다. 같은 요청의 병렬은 두 호출을 같은
 * 순간에 출발시켜 **항상 같은 행을 읽게 만들어** 그 창을 최대로 연다. 이 주석의 앞 판본이 그 둘을
 * 같은 것으로 취급해 병렬 호출을 정당화하고 있었다.
 *
 * ⚠️ **`loadAccountView`를 넓혀 해결하지 않는다** — `/projects/[slug]/settings`가 같은 함수를 쓰고
 * 이 값을 안 쓰므로, 그 화면이 매 요청 GitHub을 두 번 치게 된다.
 *
 * ⚠️ **던지지 않는다.** 이 줄 하나 때문에 화면이 빌 이유가 없다 — 실패는 `logFailure`로 남기고
 * `null`을 낸다. 연결 상태 자체는 행이 이미 말한다.
 */
export async function loadInstalledRepoCount(prisma: PrismaClient, userId: string): Promise<number | null> {
  const token = await ensureUserToken(prisma, userId, new Date());
  // 연결이 없거나 재인가가 필요한 갈래는 행이 그 사실을 말한다 — 집계가 설 자리가 아니다.
  if (token.status !== "ok") return null;

  let installations: string[];
  try {
    installations = await listUserInstallations(token.accessToken);
  } catch (error) {
    logFailure("installed-repos/list-installations", error);
    return null;
  }

  const settled = await Promise.all(
    installations.map(async (installationId): Promise<InstallationReposResult> => {
      try {
        return { repos: await listInstallationRepos(token.accessToken, installationId) };
      } catch (error) {
        // 일시중지된 설치 하나가 403을 주는 것은 영구 상태다. 그것 때문에 나머지를 못 세면
        // 화면이 "잠시 뒤 다시"를 말한다 (code-review 2026-09-07 🟡2).
        logFailure("installed-repos/list-repos", error);
        return { error };
      }
    }),
  );
  return countInstalledRepos(settled);
}
