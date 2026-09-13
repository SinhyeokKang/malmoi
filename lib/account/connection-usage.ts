import type { PrismaClient } from "@/generated/prisma/client";

/**
 * `N projects use this connection.` — GitHub 연결 해제 Dialog의 논거 (account-settings 태스크 6).
 *
 * ⚠️ **`loadAccountView`를 넓히지 않는다** — 프로젝트 설정 화면이 같은 함수를 쓰고, 그 화면은 이
 * 숫자가 필요 없다. `/account` 전용 조회로 얹는다.
 *
 * ⚠️ **`projectId`가 아니라 `userId`로 좁힌다** — 이 축의 소유자는 `User`다. `projectId` 규칙의
 * 사각지대가 정확히 이 축이고, 안 좁히면 남의 프로젝트까지 세어 확인 화면이 거짓을 말한다
 * (POSTMORTEM 2026-09-06 — `loadAccount`가 `userId` 없이 `Account`를 집었다).
 *
 * ⚠️ **0과 실패를 같은 값으로 접지 않는다.** 0은 *"어느 프로젝트도 이 연결을 쓰지 않는다"*를 말할
 * 수 있는 정보이고 숨길 이유가 없다. `null`은 **"모른다"**뿐이고 그때 화면이 그 줄을 지운다.
 *
 * ⚠️ **그래서 실패가 화면에서 무음이다 — 서버 로그에 남긴다.** 남기지 않으면 "0이라 안 보인다"와
 * "죽어서 안 보인다"를 나중에 구별할 흔적이 없다.
 */
export async function loadConnectionUsage(prisma: PrismaClient, userId: string): Promise<number | null> {
  try {
    // 세는 기준은 **내가 OWNER이고 보관되지 않은 프로젝트**다 — 발송이 실제로 멈추는 대상이 그것이다.
    return await prisma.project.count({ where: { archivedAt: null, members: { some: { userId, role: "OWNER" } } } });
  } catch {
    // 사유를 싣지 않는다 — Prisma 오류 메시지에 인자가 섞여 나온다.
    console.error("Connection usage count failed.", { userId });
    return null;
  }
}
