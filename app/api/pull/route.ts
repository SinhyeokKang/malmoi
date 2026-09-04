import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { getPrisma } from "@/lib/db";
import { classifyFailure } from "@/lib/failure";
import { optionalEnv, requireEnv } from "@/lib/env";
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
  const auth = checkBearer(request.headers.get("authorization"), optionalEnv("CRON_SECRET"));
  if (auth !== "ok") {
    // 어느 쪽이 틀렸는지 알려주지 않는다.
    return NextResponse.json(
      { error: auth === "not-configured" ? "server misconfigured" : "unauthorized" },
      { status: statusFor(auth) },
    );
  }

  // ⚠️ **`requireEnv`도 try 안이다.** 밖에 두면 설정 누락이 **본문 없는 500**으로 나가고
  // cron 로그에 원인이 남지 않는다 — 2026-09-03 Vercel 첫 배포에서 실제로 그 상태였고,
  // 무엇이 없는지 추측해야 했다. 이 메시지는 변수 이름만 담으므로 시크릿이 새지 않는다.
  try {
    const slug = requireEnv("ACTIVE_PROJECT_SLUG");
    const result = await triggerPull(getPrisma(), slug);
    return NextResponse.json(result);
  } catch (error) {
    // ⚠️ **던진 메시지를 그대로 싣지 않는다** (2026-09-04 audit #15). 우리가 만든 오류
    // (`MissingEnvError` — 변수 이름만 담는다)는 본문에 남긴다: 그게 POSTMORTEM 2026-09-03이
    // 요구한 "원인이 남는 500"이다. 남의 라이브러리 메시지는 `ref`만 내보내고 전문은 서버
    // 로그(Vercel)로 보낸다 — 이 응답은 **임의의 대상 리포**의 Actions 로그로 흘러가고
    // (`scripts/push-local.ts`가 stdout에 찍는다) 그 리포가 public이면 누구나 읽는다.
    // `lastPulledAt`은 성공 후에만 쓰이므로 다음 실행이 처음부터 다시 돈다.
    const failure = classifyFailure(error);
    if (failure.safe) return NextResponse.json({ error: failure.message }, { status: 500 });
    const ref = randomUUID().slice(0, 8);
    console.error(`[pull] ${ref} ${failure.detail}`);
    return NextResponse.json({ error: "internal", ref }, { status: 500 });
  }
}
