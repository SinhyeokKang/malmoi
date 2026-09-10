import { randomUUID } from "node:crypto";

/**
 * 접힌 실패를 **서버 로그에만** 남긴다 (`/api/pull`과 같은 형).
 *
 * ⚠️ 이 모듈이 다루는 실패는 대부분 사용자에게 `unavailable`("일시적인 오류") 한 갈래로 접혀 나간다 —
 * GitHub 5xx·네트워크·Prisma가 화면에서 구별되지 않는다. 그래서 접는 자리마다 이 한 줄이 없으면
 * 제보를 받아도 재현 말고는 길이 없다 (2026-09-03 Vercel 첫 배포가 그 상태였다). callback 라우트만
 * 로그를 남기고 Action·토큰 껍데기는 안 남기던 것을 한 곳으로 모았다 (code-review 2026-09-07 🟡2).
 *
 * **응답 본문에는 싣지 않는다.** 사유는 화면 문구가 이미 말하고, 원인 문자열은 남의 라이브러리
 * 메시지라 사용자에게 보낼 것이 아니다 (`lib/failure.ts`와 같은 판단).
 */
export function logFailure(stage: string, error: unknown): void {
  const ref = randomUUID().slice(0, 8);
  const detail = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? `http-${error.status}` : "unavailable";
  console.error(`[github-connect] ${ref} ${stage}: ${detail}`);
}
