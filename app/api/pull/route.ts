import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { getPrisma } from "@/lib/db";
import { classifyFailure } from "@/lib/failure";
import { optionalEnv } from "@/lib/env";
import { checkBearer, statusFor } from "@/lib/push/auth";
import { selectPullTargets } from "@/lib/pull/targets";
import { triggerPull } from "@/lib/pull/trigger";

/**
 * DB → `l10n/sync` PR. **cron 전용 진입점이다** — 편집 UI는 Server Action이 `triggerPull`을
 * 직접 부른다 (MVP §5, 내부 쓰기에 Route Handler를 새로 만들지 않는다).
 *
 * ⚠️ **`middleware.ts`의 matcher에 넣지 않는다.** cron 요청엔 세션이 없다. 현재 matcher는
 * `/projects/:path*`뿐이라 기본값이 안전하지만, 보호 라우트를 넓힐 때 이 경로를 함께 넣으면
 * 야간 pull이 조용히 리다이렉트된다.
 *
 * ⚠️ **준비된 프로젝트 전부를 순회한다** (2026-09-07, design §3.9). 전에는 서버 env 하나가 대상을
 * 정해서 프로젝트가 둘 이상이면 나머지가 영영 안 돌았다. **한 프로젝트의 실패가 나머지를 막지 않는다** —
 * 실패는 그 항목에만 남고 응답은 항상 배열이다.
 */

// 로케일 파일마다 blob을 읽고 트리·커밋·PR을 만든다. 기본 10초 안에 안 끝날 수 있다.
export const maxDuration = 60;

/**
 * **Vercel Cron은 `GET`으로 부른다.** POST로 만들면 cron이 붙지 않는다 — 이 라우트가 부수효과가
 * 있는데도 `GET`인 유일한 이유다.
 */
export async function GET(request: Request): Promise<NextResponse> {
  // fail-closed — 환경변수가 비어 있으면 아무도 통과하지 못한다. 빈 값을 "인증 없음"으로 읽으면
  // 아무나 커밋을 유발할 수 있다 (ARCHITECTURE §6).
  // ⚠️ **`checkBearer`의 유일한 소비자가 됐다** (2026-09-07) — `/api/push`는 공유 시크릿 비교를 버리고
  // `Project.pushTokenHash` 조회로 옮겨갔다. 여기 남는 이유는 cron 시크릿이 프로젝트와 무관해서다.
  const auth = checkBearer(request.headers.get("authorization"), optionalEnv("CRON_SECRET"));
  if (auth !== "ok") {
    // 어느 쪽이 틀렸는지 알려주지 않는다.
    return NextResponse.json(
      { error: auth === "not-configured" ? "server misconfigured" : "unauthorized" },
      { status: statusFor(auth) },
    );
  }

  // ⚠️ **조회도 try 안이다.** 밖에 두면 DB 장애가 **본문 없는 500**으로 나가고 cron 로그에 원인이
  // 남지 않는다 — 2026-09-03 Vercel 첫 배포에서 실제로 그 상태였고, 무엇이 없는지 추측해야 했다.
  try {
    const prisma = getPrisma();
    // 순회 대상은 판정층이 고른다 (`lib/pull/targets.ts`) — 준비 안 된 프로젝트를 돌리면 던진다.
    const projects = await prisma.project.findMany({
      select: { slug: true, installationId: true, lastCommitSha: true },
    });

    const results: unknown[] = [];
    for (const slug of selectPullTargets(projects)) {
      // ⚠️ **프로젝트마다 잡는다.** 한 프로젝트의 GitHub 장애가 나머지의 편집을 다음 밤까지 묶어두면
      // 안 된다. `lastPulledAt`은 성공한 프로젝트에만 쓰이므로 실패가 편집을 잃지 않는다.
      try {
        results.push({ slug, ...(await triggerPull(prisma, slug)) });
      } catch (error) {
        results.push({ slug, ...failureItem(slug, error) });
      }
    }
    return NextResponse.json(results);
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

/**
 * 프로젝트 하나의 실패를 응답 항목으로. **전문을 싣지 않는다** — 우리가 문구를 정한 오류
 * (`AppError`·`MissingEnvError`)만 본문에 남고 남의 라이브러리 메시지는 `ref`로만 나간다
 * (ARCHITECTURE §6.0). 로그에는 slug를 함께 남긴다 — 배열 응답을 놓쳐도 어느 프로젝트였는지 알아야 한다.
 */
function failureItem(slug: string, error: unknown): { status: "failed"; error?: string; ref?: string } {
  const failure = classifyFailure(error);
  if (failure.safe) return { status: "failed", error: failure.message };
  const ref = randomUUID().slice(0, 8);
  console.error(`[pull:${slug}] ${ref} ${failure.detail}`);
  return { status: "failed", ref };
}
