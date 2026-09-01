import { NextResponse } from "next/server";

import { getPrisma } from "@/lib/db";
import { requireEnv } from "@/lib/env";
import { checkBearer, statusFor } from "@/lib/push/auth";
import { triggerPull } from "@/lib/pull/trigger";

/**
 * DB → `l10n/sync` PR. **cron 전용 진입점이다** — 편집 UI는 Server Action이 `triggerPull`을
 * 직접 부른다 (MVP §5, 내부 쓰기에 Route Handler를 새로 만들지 않는다).
 *
 * ⚠️ **`middleware.ts`의 matcher에 넣지 않는다.** cron 요청엔 세션이 없다. 현재 matcher는
 * `/keys/:path*`뿐이라 기본값이 안전하지만, 보호 라우트를 넓힐 때 이 경로를 함께 넣으면
 * 야간 pull이 조용히 리다이렉트된다.
 */

// 로케일 파일마다 blob을 읽고 트리·커밋·PR을 만든다. 기본 10초 안에 안 끝날 수 있다.
export const maxDuration = 60;

/**
 * **Vercel Cron은 `GET`으로 부른다.** POST로 만들면 cron이 붙지 않는다 — 이 라우트가 부수효과가
 * 있는데도 `GET`인 유일한 이유다.
 */
export async function GET(request: Request): Promise<NextResponse> {
  // `PUSH_TOKEN`과 같은 fail-closed 검사를 재사용한다 — 환경변수가 비어 있으면 아무도 통과하지
  // 못한다. 빈 값을 "인증 없음"으로 읽으면 아무나 커밋을 유발할 수 있다 (ARCHITECTURE §6).
  const auth = checkBearer(request.headers.get("authorization"), process.env["CRON_SECRET"]);
  if (auth !== "ok") {
    // 어느 쪽이 틀렸는지 알려주지 않는다.
    return NextResponse.json(
      { error: auth === "not-configured" ? "server misconfigured" : "unauthorized" },
      { status: statusFor(auth) },
    );
  }

  const slug = requireEnv("ACTIVE_PROJECT_SLUG");

  try {
    const result = await triggerPull(getPrisma(), slug);
    return NextResponse.json(result);
  } catch (error) {
    // 실패를 조용히 삼키지 않는다 — cron 로그에서 무엇이 틀렸는지 보여야 한다.
    // `lastPulledAt`은 성공 후에만 쓰이므로 다음 실행이 처음부터 다시 돈다.
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
