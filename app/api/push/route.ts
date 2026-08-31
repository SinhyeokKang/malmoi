import { NextResponse } from "next/server";

import { getPrisma } from "@/lib/db";
import { requireEnv } from "@/lib/env";
import { applyPush } from "@/lib/push/apply";
import { checkBearer, statusFor } from "@/lib/push/auth";
import { PushPayload } from "@/lib/push/plan";

/**
 * CI → DB. **외부 진입점이라 Server Action이 아니라 Route Handler다** (MVP §5) — Actions는
 * 안정된 공개 계약이 아니다.
 *
 * `POST`인 이유와 `PATCH`가 불가능한 이유는 MVP §3.1에 있다: 전체 키 집합을 받아야
 * `orphaned`를 판정할 수 있고, 번역값은 건드리지 않으므로 리소스 교체가 아니다.
 */

// 1446키 벌크 쓰기가 기본 10초 안에 안 끝날 수 있다.
export const maxDuration = 60;

export async function POST(request: Request): Promise<NextResponse> {
  const auth = checkBearer(request.headers.get("authorization"), process.env["PUSH_TOKEN"]);
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

  const prisma = getPrisma();
  const slug = requireEnv("ACTIVE_PROJECT_SLUG");
  const project = await prisma.project.findUnique({ where: { slug }, select: { id: true } });
  if (!project) {
    return NextResponse.json({ error: `project '${slug}' not found` }, { status: 404 });
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
    refs: outcome.refs,
  });
}
