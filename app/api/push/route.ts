import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getPrisma } from "@/lib/db";
import { classifyFailure } from "@/lib/failure";
import { abandonImportRun, finishImportRun, markImportStarted } from "@/lib/projects/import-status-store";
import { applyProtectedPush, ApplyGuardError } from "@/lib/push/apply";
import type { PushResponse } from "@/lib/push/payload";
import { countPending } from "@/lib/protection/where";
import { checkArchived, checkCommitOrder, checkFormat, checkProjectSlug, guardStatus } from "@/lib/push/guard";
import { PushPayload } from "@/lib/push/plan";
import { hashPushToken } from "@/lib/push/token";

/**
 * CI → DB. **외부 진입점이라 Server Action이 아니라 Route Handler다** (CLAUDE.md "데이터 변경 경로") — Actions는
 * 안정된 공개 계약이 아니다.
 *
 * `POST`인 이유와 `PATCH`가 불가능한 이유는 ARCHITECTURE §0 불변식 2에 있다: 전체 키 집합을 받아야
 * `orphaned`를 판정할 수 있고, 리소스 교체가 아니라 부수효과 있는 RPC다.
 *
 * **번역값은 리포 값으로 덮는다** (strict — ARCHITECTURE §0 불변식 2). 단 **미전달 편집이 프로젝트에 하나라도 있으면
 * 적재 전체를 보류한다** (sync-edit-protection, 2026-09-18) — 200 `deferred`이고 어떤 컬럼도 쓰지 않는다. 리포를 보지 않는다.
 *
 * ⚠️ **인증은 토큰이 프로젝트를 정한다** (2026-09-07, design §3.8). `sha256(원문)`으로
 * `Project.pushTokenHash`를 조회하고, 그 행의 slug와 페이로드를 **그 뒤에** 대조한다. 페이로드 slug로 행을
 * 먼저 찾으면 **오배송된 페이로드가 인증 대상을 고르게 된다.** 서버 env 둘(공유 토큰·활성 프로젝트 slug)은
 * 이 라우트에서 사라졌다 — `checkBearer`는 `/api/pull`의 `CRON_SECRET` 전용으로 남는다.
 */

// 1446키 벌크 쓰기가 기본 10초 안에 안 끝날 수 있다.
export const maxDuration = 60;

export async function POST(request: Request): Promise<NextResponse> {
  // 헤더 형식만 여기서 본다 — 대조는 DB 조회이고, 그건 아래 `try` 안이다(장애가 401로 접히면 안 된다).
  const header = request.headers.get("authorization");
  if (header === null || !header.startsWith("Bearer ")) {
    // 어느 쪽이 틀렸는지 알려주지 않는다 — 토큰 존재 여부를 탐색할 단서를 주지 않는다.
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // 값을 트림한다 — HTTP 헤더 값의 앞뒤 공백은 전송 계층에서 이미 사라질 수 있어(`Bearer `가 `Bearer`가 된다)
  // 그 우연에 기대지 않는다. 빈 토큰으로 DB 왕복을 내주지도 않는다.
  const rawToken = header.slice("Bearer ".length).trim();
  if (rawToken === "") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ⚠️ **여기부터 try 안이다.** 밖에 두면 설정 누락·DB 장애·벌크 쓰기 실패가 전부 **본문 없는
  // 500**으로 나가고, 이 라우트의 호출자는 사람이 아니라 GitHub Actions라 로그에 원인이 남지
  // 않으면 진단할 재료가 없다. 2026-09-03 Vercel 첫 배포에서 실제로 그 상태였다.
  //
  // ⚠️ **JSON·스키마 검사가 인증 뒤로 왔다** (2026-09-07 code-review). `maxDuration = 60`인 공개
  // 엔드포인트라, 무효 토큰 하나로 1446키 페이로드를 파싱·검증시키고 zod `issues`(스키마 구조)까지
  // 받아 갈 수 있으면 안 된다. **둘 다 `return`이라 이 `try`가 400을 500으로 접지 않는다** — 접히는 것은
  // `throw`뿐이고 JSON 파싱의 throw는 자기 `catch`가 400으로 받는다.
  try {
    const prisma = getPrisma();
    // **토큰이 프로젝트를 정한다.** 원문은 쿼리에 실리지 않고, 발급받지 않은 프로젝트(`pushTokenHash`가 null)는
    // 어떤 해시로도 조회되지 않는다 — fail-closed가 컬럼의 성질로 성립한다 (design §3.8).
    const project = await prisma.project.findUnique({
      where: { pushTokenHash: hashPushToken(rawToken) },
      // 포맷 셋은 `checkFormat`의 비교 대상이다 — 온보딩이 확정한 표면을 CI가 갈아치우지 못하게 한다.
      select: {
        id: true,
        slug: true,
        // ⚠️ **optional로 두지 않는다** — 껍데기가 빼면 `checkFormat`이 선언을 못 보고 base 변경이
        // 영구 409가 된다. 타입이 그것을 컴파일 타임에 막는다 (design §3.13).
        // 보관 거부 (7단계) — 멈춘 프로젝트를 리포가 계속 덮으면 보관 중에 번역이 조용히 바뀐다.
        archivedAt: true,
      },
    });
    // ⚠️ **404를 내지 않는다** — 토큰이 유효하지 않은 것과 그런 프로젝트가 없는 것을 가르면 프로젝트 존재가
    // 샌다. 미발급·오타·폐기 토큰이 전부 같은 401이다.
    if (!project) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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

    /**
     * 보관 거부 (7단계 — sync-runs design §4, 결정 9). **오배송·표면 검사보다 앞이다** — 멈춘
     * 프로젝트에서는 페이로드가 맞는지가 답할 질문이 아니고, 그 셋 중 무엇이 걸리든 사용자가
     * 할 일은 같다(워크플로를 뗀다).
     */
    const archived = checkArchived(project.archivedAt);
    if (archived !== "ok") {
      return NextResponse.json({ error: "archived" }, { status: guardStatus(archived) });
    }

    // 오배송 거부 — 대조 대상이 **토큰이 정한 프로젝트**다 (전에는 서버 env였다).
    const routing = checkProjectSlug(parsed.data.projectSlug, project.slug);
    if (routing !== "ok") {
      // slug는 비밀이 아니라 라우팅 정보다 — CI 로그에서 진단하려면 둘 다 보여야 한다. 토큰이 이미 그
      // 프로젝트의 것으로 확인됐으므로 `expected`를 보여도 새로 새는 정보가 없다.
      return NextResponse.json(
        { error: "project mismatch", expected: project.slug, got: parsed.data.projectSlug },
        { status: guardStatus(routing) },
      );
    }

    /**
     * 표면 교체 거부 — 온보딩이 확정한 포맷을 CI가 다른 것으로 덮지 못하게 한다 (ARCHITECTURE §5.5.5).
     * `applyPush`가 페이로드 포맷으로 그 컬럼들을 덮으므로, 자동 후보의 YAML로 도는 CI가 1순위 표면을
     * 보내면 확정이 조용히 뒤집히고 그 프로젝트의 키가 전부 orphan된다.
     */
    const surface = await prisma.translationSurface.findFirst({
      where: { projectId: project.id, slug: parsed.data.surfaceSlug, archivedAt: null },
    });
    if (!surface) return NextResponse.json({ error: "surface mismatch" }, { status: 409 });
    const formatCheck = checkFormat(parsed.data.format, surface);
    if (formatCheck !== "ok") {
      // 무엇을 고쳐야 하는지 보여준다 — `expected`는 이미 그 프로젝트의 토큰을 든 호출자에게만 간다.
      // 고치는 방법은 워크플로에 `adapter:`·`base-locale:`을 박는 것이고 화면이 그 YAML을 낸다.
      return NextResponse.json(
        {
          error: "format mismatch",
          expected: {
            adapter: surface.adapterName,
            pathTemplate: surface.pathTemplate,
            baseLocale: surface.baseLocale,
            // ⚠️ **선언도 보인다** (6b-3). 없으면 대기 중인 프로젝트의 CI 로그가 "expected en, got fr"만
            // 보여, 실제로는 `ko`도 받아들여진다는 사실이 진단에서 사라진다. 비밀이 아니라 라우팅 정보다.
            declaredBaseLocale: surface.declaredBaseLocale,
          },
          got: {
            adapter: parsed.data.format.adapter,
            pathTemplate: parsed.data.format.pathTemplate,
            baseLocale: parsed.data.format.baseLocale,
          },
        },
        { status: guardStatus(formatCheck) },
      );
    }

    // 역행 거부 — 오래된 run의 Re-run이 DB를 그 시점으로 되돌리는 것을 막는다 (ARCHITECTURE §5.5.5).
    const commitAt = new Date(parsed.data.commitAt);
    const order = checkCommitOrder(commitAt, surface.lastCommitAt);
    if (order !== "ok") {
      return NextResponse.json(
        {
          error: "stale commit",
          commitAt: parsed.data.commitAt,
          lastCommitAt: surface.lastCommitAt?.toISOString() ?? null,
        },
        { status: guardStatus(order) },
      );
    }

    /**
     * ⚠️ **`previousBaseLocale`은 이 행의 값이다** — `applyPush`가 그것으로 base 교체를 알아보고
     * `needsReview` 전파를 건너뛴다 (design §3.13). 아래 update가 `baseLocale`을 덮으므로 **덮기 전의
     * 값**을 넘겨야 하고, 그래서 조회를 다시 하지 않고 위에서 읽은 행을 그대로 쓴다.
     */
    /**
     * **진행 표시는 서버가 실제로 처리 중인 구간만 말한다** (projects-list design §3.35) — 그래서
     * 가드 **뒤**다. 거부된 요청까지 세우면 목록이 돌지 않는 적재를 "진행 중"으로 그린다.
     */
    /**
     * **보류 판정이 진행 표시보다 먼저다** (sync-edit-protection design §3). 보류는 아무것도 하지 않은 것이라 표시를
     * 세웠다 지우는 쓰기조차 없어야 한다(완료 조건 2) — 그래서 표시 전에 한 번 센다. 판정과 적용 사이 경합은
     * `applyProtectedPush`가 잠금 안에서 다시 세고 재집계로 잡는다.
     *
     * ⚠️ design §3은 `markImportStarted`를 적용 트랜잭션 안으로 옮기라고 했지만 그러면 롤백된 실패에서 표시가 없어
     * `finishImportRun`의 토큰 대조가 0행이 되고 `import-failed` 기록이 사라진다. 트랜잭션 밖 사전 집계로 같은 목적을 이룬다.
     */
    const pendingBefore = await countPending(prisma, project.id);
    if (pendingBefore > 0) return deferred(project.id, parsed.data.commitSha, pendingBefore);

    const startedAt = new Date();
    const token = randomUUID();
    const scope = { projectId: project.id, surfaceId: surface.id };
    await markImportStarted(prisma, scope, startedAt, token);

    let result;
    try {
      result = await applyProtectedPush(prisma, scope, parsed.data, {
        refsMode: "replace", previousBaseLocale: surface.baseLocale,
        startedAt, token,
        // CI push는 전부 받거나 400이라 부분 실패가 없다 — 성공이면 이전 실패가 같은 트랜잭션에서 지워진다.
        importOutcome: null,
      });
    } catch (error) {
      // ⚠️ **자기 실행 토큰을 대조해서만 지운다** — 그 사이 다른 실행이 시작했으면 그쪽 표시를 뺏지 않는다.
      await finishImportRun(prisma, { ...scope, token, code: "import-failed" });
      if (error instanceof ApplyGuardError) {
        const message = { archived: "archived", "wrong-format": "format mismatch", "wrong-project": "project mismatch", "stale-commit": "stale commit" }[error.code];
        return NextResponse.json({ error: message }, { status: guardStatus(error.code) });
      }
      throw error;
    } finally {
      /**
       * 실패도 결과 표시를 바꾼다 — 성공 때만 지우면 목록에 캐시된 상태가 남는다.
       *
       * ⚠️ **`/projects`는 접두가 아니라 경로 하나다** — 모달 뒤에 같은 목록을 그리는
       * `/projects/new`를 따로 지운다 (POSTMORTEM 2026-09-09).
       * ⚠️ **프로젝트 서브트리도 지운다** — 첫 push가 `lastCommitSha`를 세워 readiness를 넘긴다.
       */
      revalidatePath(`/projects/${project.slug}`, "layout");
      revalidatePath("/projects");
      revalidatePath("/projects/new");
    }

    if (result.status === "deferred") {
      // 롤백됐으니 결과 필드는 옛 그대로다 — 진행 표시만 거둔다.
      await abandonImportRun(prisma, { ...scope, token });
      return deferred(project.id, parsed.data.commitSha, result.pendingCount);
    }
    const outcome = result.outcome;
    return NextResponse.json<PushResponse>({
      status: "applied",
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
    // ⚠️ **던진 메시지를 그대로 싣지 않는다** (2026-09-04 audit #15). 우리가 만든 오류
    // (`MissingEnvError` — 변수 이름만 담는다)는 본문에 남긴다: 그게 POSTMORTEM 2026-09-03이
    // 요구한 "원인이 남는 500"이다. 남의 라이브러리 메시지는 `ref`만 내보내고 전문은 서버
    // 로그(Vercel)로 보낸다 — 이 응답은 **임의의 대상 리포**의 Actions 로그로 흘러가고
    // (`scripts/push-local.ts`가 stdout에 찍는다) 그 리포가 public이면 누구나 읽는다.
    const failure = classifyFailure(error);
    if (failure.safe) return NextResponse.json({ error: failure.message }, { status: 500 });
    const ref = randomUUID().slice(0, 8);
    console.error(`[push] ${ref} ${failure.detail}`);
    return NextResponse.json({ error: "internal", ref }, { status: 500 });
  }
}

/**
 * 보류 응답. **200이다** — 오류가 아니라 "편집이 먼저 전달돼야 한다"는 정상 결과이고, 구 action 태그(`@malmoi-i18n-push-v1`)의
 * CLI도 `res.ok`로 exit 0이 된다(design §3). 편집 셀·토큰은 싣지 않는다 — 대상 리포의 Actions 로그가 public일 수 있다.
 */
function deferred(projectId: string, commitSha: string, pendingCount: number): NextResponse {
  return NextResponse.json<PushResponse>({ status: "deferred", reason: "pending-edits", pendingCount, projectId, commitSha });
}
