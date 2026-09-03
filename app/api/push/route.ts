import { NextResponse } from "next/server";

import { getPrisma } from "@/lib/db";
import { optionalEnv, requireEnv } from "@/lib/env";
import { applyPush } from "@/lib/push/apply";
import { checkBearer, statusFor } from "@/lib/push/auth";
import { checkCommitOrder, checkProjectSlug, guardStatus } from "@/lib/push/guard";
import { PushPayload } from "@/lib/push/plan";

/**
 * CI → DB. **외부 진입점이라 Server Action이 아니라 Route Handler다** (MVP §5) — Actions는
 * 안정된 공개 계약이 아니다.
 *
 * `POST`인 이유와 `PATCH`가 불가능한 이유는 MVP §3.1에 있다: 전체 키 집합을 받아야
 * `orphaned`를 판정할 수 있고, 리소스 교체가 아니라 부수효과 있는 RPC다.
 *
 * **번역값은 리포 값으로 덮는다** (strict — MVP §3.1). 대가인 편집 손실 창도 거기 있다.
 */

// 1446키 벌크 쓰기가 기본 10초 안에 안 끝날 수 있다.
export const maxDuration = 60;

export async function POST(request: Request): Promise<NextResponse> {
  // `requireEnv`가 아니다 — 누락은 `checkBearer`가 `not-configured`(500)로 가른다.
  const auth = checkBearer(request.headers.get("authorization"), optionalEnv("PUSH_TOKEN"));
  if (auth !== "ok") {
    // 어느 쪽이 틀렸는지 알려주지 않는다 — 토큰 존재 여부를 탐색할 단서를 주지 않는다.
    return NextResponse.json({ error: auth === "not-configured" ? "server misconfigured" : "unauthorized" }, { status: statusFor(auth) });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = PushPayload.safeParse(body);
  if (!parsed.success) {
    // 검증 실패를 조용히 삼키지 않는다 — CI 로그에서 무엇이 틀렸는지 보여야 한다.
    return NextResponse.json({ error: "invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  // ⚠️ **여기부터 try 안이다.** 밖에 두면 설정 누락·DB 장애·벌크 쓰기 실패가 전부 **본문 없는
  // 500**으로 나가고, 이 라우트의 호출자는 사람이 아니라 GitHub Actions라 로그에 원인이 남지
  // 않으면 진단할 재료가 없다. 2026-09-03 Vercel 첫 배포에서 실제로 그 상태였다.
  // 위쪽 인증·JSON·스키마 검사는 이미 자기 응답을 내므로 감싸지 않는다 — 감싸면 400이 500으로 접힌다.
  try {
    const slug = requireEnv("ACTIVE_PROJECT_SLUG");

    // 오배송 거부 — DB를 조회하기 전에 본다. 대상이 틀렸으면 찾아볼 프로젝트도 아니다.
    const routing = checkProjectSlug(parsed.data.projectSlug, slug);
    if (routing !== "ok") {
      // slug는 비밀이 아니라 라우팅 정보다 — CI 로그에서 진단하려면 둘 다 보여야 한다.
      return NextResponse.json(
        { error: "project mismatch", expected: slug, got: parsed.data.projectSlug },
        { status: guardStatus(routing) },
      );
    }

    const prisma = getPrisma();
    const project = await prisma.project.findUnique({
      where: { slug },
      select: { id: true, lastCommitAt: true },
    });
    if (!project) {
      return NextResponse.json({ error: `project '${slug}' not found` }, { status: 404 });
    }

    // 역행 거부 — 오래된 run의 Re-run이 DB를 그 시점으로 되돌리는 것을 막는다 (ARCHITECTURE §5.5.5).
    const commitAt = new Date(parsed.data.commitAt);
    const order = checkCommitOrder(commitAt, project.lastCommitAt);
    if (order !== "ok") {
      return NextResponse.json(
        {
          error: "stale commit",
          commitAt: parsed.data.commitAt,
          lastCommitAt: project.lastCommitAt?.toISOString() ?? null,
        },
        { status: guardStatus(order) },
      );
    }

    const outcome = await applyPush(prisma, project.id, parsed.data);
    return NextResponse.json({
      projectId: project.id,
      commitSha: parsed.data.commitSha,
      inserted: outcome.inserted,
      updated: outcome.updated,
      orphaned: outcome.orphaned,
      unorphaned: outcome.unorphaned,
      staleTranslations: outcome.staleTranslations,
      translationsFilled: outcome.translationsFilled,
      // 사라진 로케일은 CI 로그에 남아야 의도한 삭제인지 실수인지 안다.
      orphanedLocales: outcome.orphanedLocales,
      refs: outcome.refs,
    });
  } catch (error) {
    // Actions 로그에 원인이 남아야 한다. `requireEnv`의 메시지는 변수 이름만 담는다.
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

