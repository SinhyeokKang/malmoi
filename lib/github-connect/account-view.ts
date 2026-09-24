import type { PrismaClient } from "@/generated/prisma/client";

import { AppError, httpStatus } from "@/lib/failure";
import { GITHUB_WAIT_MS, withinGithubWait } from "@/lib/github-wait";

import { logFailure } from "./log";
import { ensureUserToken } from "./token-store";
import { getViewer } from "./user";

/**
 * "이 사용자의 GitHub 연결이 지금 어떤 상태인가" — **화면 둘이 이 함수 하나를 읽는다** (6b-4).
 *
 * ⚠️ **설정 화면에 있던 `loadAccount`를 내렸다.** `/account`가 생기면서 같은 3갈래 판정이 두 화면에
 * 필요해졌고, 사본을 두면 한쪽이 낡는다 — `basePending`을 두 화면이 각자 부르는 것과 같은 형이다.
 * 두 화면의 차이는 **연결 버튼의 착지**뿐이고(`dest`), 그건 화면이 정한다.
 *
 * ⚠️ **세션 사용자의 행만 본다.** `userId`가 빠지면 아무의 연결이나 집어 남의 GitHub 핸들을 화면에
 * 띄운다 — 조회를 인가된 주체로 좁히는 것은 `projectId` 규칙과 같은 축이다 (POSTMORTEM 2026-09-06).
 *
 * `server-only`를 붙이지 않는다 — `lib/github-connect/`의 다른 모듈과 같다.
 */
export type AccountView =
  /** `login`이 `null`이면 연결이 없다 — 실패가 아니라 아직 안 한 것이다. */
  | { status: "ok"; login: string | null }
  | { status: "reauthorize" }
  | { status: "unavailable" };

/**
 * ⚠️ **마감이 probe와 같다** (`GITHUB_WAIT_MS` — ARCHITECTURE §6.5.2). 설정 화면이 이 값을 스트리밍하므로 `GET /user`가
 * 멈추면 이미 다 그려진 페이지의 스트림이 `maxDuration`까지 열려 있다가 오류 경계로 뒤집힌다. 넘기면 `unavailable`
 * ("잠시 뒤 다시")이다 — 모르는 것을 연결 없음·인가 철회로 말하지 않는다(§6.5.1).
 * ⚠️ **넘긴 토큰 갱신은 취소되지 않는다** — 뒤에서 끝나 행을 쓴다. `/account`는 `unavailable`이면
 * `loadInstalledRepoCount`를 안 부르므로 같은 요청에서 `ensureUserToken`이 둘이 되지 않는다(§6.5.1의 직렬화 규칙).
 */
export async function loadAccountView(prisma: PrismaClient, userId: string): Promise<AccountView> {
  return withinGithubWait(readAccountView(prisma, userId), () => {
    logFailure("viewer-deadline", new AppError(`no response within ${GITHUB_WAIT_MS}ms`));
    return { status: "unavailable" };
  });
}

async function readAccountView(prisma: PrismaClient, userId: string): Promise<AccountView> {
  const token = await ensureUserToken(prisma, userId, new Date());
  if (token.status === "not-connected") return { status: "ok", login: null };
  if (token.status === "reauthorize") return { status: "reauthorize" };
  if (token.status === "unavailable") return { status: "unavailable" };

  try {
    return { status: "ok", login: (await getViewer(token.accessToken)).login };
  } catch (error) {
    logFailure("viewer", error);
    /**
     * ⚠️ **401은 인가 철회이고 영구 상태다** (2026-09-19 프로덕션 실측). 저장된 토큰은 아직 만료 전이라
     * `ensureUserToken`이 `ok`를 주고 이 401이 유일한 신호다 — **다음 호출도 같은 401**이므로 "둘을 가르는
     * 것은 다음 호출"이 거짓이었다. `unavailable`로 접으면 화면이 "잠시 뒤 다시"를 말하며 컨트롤을 하나도
     * 안 세워, 사용자가 다시 연결하지도 해제하지도 못하는 자리에 갇힌다. `listFailure`와 같은 판정이다.
     */
    return httpStatus(error) === 401 ? { status: "reauthorize" } : { status: "unavailable" };
  }
}
