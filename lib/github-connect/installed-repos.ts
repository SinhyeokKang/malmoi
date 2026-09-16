import type { PrismaClient } from "@/generated/prisma/client";

import { logFailure } from "./log";
import { ensureUserToken } from "./token-store";
import { listInstallationRepos, listUserInstallations } from "./user";

/**
 * `/account`의 GitHub App 행이 드는 **설치된 리포 수** (design §1.1·§2.2).
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
 * ⚠️ **`ensureUserToken`을 같은 요청에서 두 번 부르는 것이 안전한 이유.** `loadAccountView`와 이
 * 조회가 둘 다 부르고, 토큰이 만료였으면 **둘 다 갱신을 시도한다.** GitHub의 refresh 토큰은
 * 1회용이지만 `token-store.ts`가 **조건부 쓰기 + 경합 뒤 한 번 다시 읽기**(`afterRace`)로 그것을
 * 이미 다룬다 — 진 쪽은 이긴 쪽이 회전시킨 토큰을 받는다. **이 주석이 없으면 다음 사람이
 * "토큰을 두 번 얻는다"를 보고 `loadAccountView`를 넓히려 든다**, 그러면 이 값을 안 쓰는
 * `/projects/[slug]/settings`가 매 요청 GitHub을 친다 (design §2.1).
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
