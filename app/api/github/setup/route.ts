import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { setupLanding } from "@/lib/github-connect/setup";

/**
 * GitHub App의 **Setup URL** — 설치(또는 설치 요청) 뒤 GitHub이 브라우저를 되돌리는 지점
 * (ARCHITECTURE §6.4). 이게 없으면 사용자는 GitHub의 설치 설정 화면에 남고, malmoi 쪽은
 * 새로고침해야 리포가 떴다(2026-09-18 리허설).
 *
 * `callback`과 같은 형이다: 호출자가 GitHub이 보낸 전체 페이지 내비게이션이라 Server Action이
 * 받을 수 없고, ⚠️ **`middleware.ts`의 matcher에 넣지 않는다** — 대신 `requireUser()`를 지나고
 * `entry-points.test.ts`의 `GUARDS`가 그것을 센다.
 *
 * ⚠️ **읽는 것은 `setup_action` 하나다.** `installation_id`는 믿을 이유가 없다 — 목적지 화면이
 * 사용자 토큰으로 설치 목록을 다시 조회한다.
 */
export async function GET(request: Request): Promise<NextResponse> {
  await requireUser();
  const action = new URL(request.url).searchParams.get("setup_action");
  return NextResponse.redirect(new URL(setupLanding(action), request.url));
}
