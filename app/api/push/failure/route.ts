import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { readBoundedText } from "@/lib/bounded-body";
import { getPrisma } from "@/lib/db";
import { recordCiImport } from "@/lib/events/ci";
import { classifyFailure } from "@/lib/failure";
import { logFailure } from "@/lib/github-connect/log";
import { ImportFailureReport } from "@/lib/projects/import-status";
import { recordReportedFailure } from "@/lib/projects/import-status-store";
import { checkArchived, checkCommitOrder, checkProjectSlug, guardStatus } from "@/lib/push/guard";
import { hashPushToken } from "@/lib/push/token";

/**
 * CI가 **적재에 실패했다는 사실**을 남기는 자리 (PRODUCT §7.8). 로케일 파일을 파싱하지
 * 못하면 `/api/push`는 아예 불리지 않으므로, 그 실패는 여태 대상 리포의 Actions 로그에만 있었다 —
 * 말모이 쪽 화면에서는 프로젝트가 그냥 조용했다.
 *
 * ⚠️ **정상 push와 섞지 않는다.** 실패 보고에는 포맷·키·번역 페이로드가 필요 없고, 그것을 요구하면
 * "읽지 못해서 실패한 쪽"이 보고할 수 없는 것을 만들어야 한다.
 *
 * ⚠️ **아무것도 적재하지 않는다** — 키·번역은 물론 `lastCommitSha`·`lastCommitAt`도 안 움직인다
 * (ARCHITECTURE §0 불변식 2의 소유자 규칙을 상태 보고가 건드리지 않는다). 전진시키면 다음 정상
 * push가 자기 커밋으로 `stale-commit` 409를 받는다.
 *
 * ⚠️ **의미는 "마지막으로 수신한 실패"다** — 실행 이력도 CI 전체의 상태도 복원하지 않는다.
 */

/** 보고 본문의 상한. 코드 하나 + 커밋 정보라 이보다 클 이유가 없다. */
const MAX_BODY_BYTES = 4096;

export async function POST(request: Request): Promise<NextResponse> {
  // 헤더 형식만 여기서 본다 — 대조는 DB 조회이고 그건 `try` 안이다(장애가 401로 접히면 안 된다).
  const header = request.headers.get("authorization");
  if (header === null || !header.startsWith("Bearer ")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const rawToken = header.slice("Bearer ".length).trim();
  if (rawToken === "") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const prisma = getPrisma();
    /**
     * **토큰이 프로젝트를 정한다** — `/api/push`와 같은 순서다 (PRODUCT §7.8). 본문의 slug로 행을 찾으면
     * 오배송된 보고가 인증 대상을 고르게 된다.
     *
     * ⚠️ **인증이 본문보다 먼저다.** 무효 토큰 하나로 스키마 구조(zod `issues`)를 받아 갈 수 없다.
     */
    const tokenHash = hashPushToken(rawToken);
    const project = await prisma.project.findUnique({
      where: { pushTokenHash: tokenHash },
      select: { id: true, slug: true, archivedAt: true },
    });
    // 미발급·오타·폐기 토큰이 전부 같은 401이다 — 404를 내면 프로젝트 존재가 샌다.
    if (!project) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // 선언된 길이는 읽기 전에, chunked는 읽는 도중에 끊는다 — 다 읽고 재면 메모리는 이미 쓴 뒤다 (audit #76).
    const raw = await readBoundedText(request, MAX_BODY_BYTES);
    if (raw === null) {
      return NextResponse.json({ error: "body too large" }, { status: 400 });
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "invalid json" }, { status: 400 });
    }

    const parsed = ImportFailureReport.safeParse(body);
    if (!parsed.success) {
      // CI 로그에서 무엇이 틀렸는지 보여야 한다 — 여기까지 온 호출자는 이미 그 프로젝트의 토큰을 들었다.
      return NextResponse.json({ error: "invalid report", issues: parsed.error.issues }, { status: 400 });
    }

    // 거부 셋은 `/api/push`와 **같은 순수 함수**를 지난다 — 두 벌이 되면 정상 push는 통과하는 커밋이
    // 실패 보고에서만 거부된다.
    const archived = checkArchived(project.archivedAt);
    if (archived !== "ok") {
      return NextResponse.json({ error: "archived" }, { status: guardStatus(archived) });
    }
    const routing = checkProjectSlug(parsed.data.projectSlug, project.slug);
    if (routing !== "ok") {
      return NextResponse.json(
        { error: "project mismatch", expected: project.slug, got: parsed.data.projectSlug },
        { status: guardStatus(routing) },
      );
    }
    const surface = await prisma.translationSurface.findFirst({
      where: { projectId: project.id, slug: parsed.data.surfaceSlug, archivedAt: null },
    });
    if (!surface) return NextResponse.json({ error: "surface mismatch" }, { status: 409 });
    const commitAt = new Date(parsed.data.commitAt);
    const order = checkCommitOrder(commitAt, surface.lastCommitAt);
    if (order !== "ok") {
      return NextResponse.json(
        { error: "stale commit", commitAt: parsed.data.commitAt, lastCommitAt: surface.lastCommitAt?.toISOString() ?? null },
        { status: guardStatus(order) },
      );
    }

    /**
     * ⚠️ **위 검사를 통과했다고 무조건 쓰지 않는다.** 여기까지 오는 사이에 성공한 push가 들어왔을 수
     * 있고, 그러면 오래된 실패가 그것을 덮는다. 같은 조건을 UPDATE의 `where`에 다시 싣고 갱신 건수로
     * 판정한다 — 위 검사는 **진단 가능한 409**를 만들기 위한 것이고, 이쪽이 실제 방어선이다.
     */
    const recorded = await recordReportedFailure(prisma, {
      projectId: project.id,
      surfaceId: surface.id,
      tokenHash,
      commitAt,
      code: parsed.data.code,
    });
    if (recorded !== "recorded") {
      return NextResponse.json({ error: "stale report" }, { status: 409 });
    }

    /**
     * ⚠️ **갱신이 실제로 일어난 뒤에만 사건을 남긴다** — 위 `recorded` 판정이 실제 방어선이고,
     * 그 앞에서 기록하면 성공한 push를 덮지 못한 낡은 보고가 이력에는 실패로 선다.
     *
     * ⚠️ **정상 push와 같은 실행 식별자를 쓴다** (design §3.3) — 한 실행이 성공 보고와 실패 보고를
     * 동시에 내지 않으므로, 같은 `runToken`이 둘 중 하나를 한 건으로 만든다. 식별자가 없는 구
     * 생산자는 요청별 값이라 재전달 중복 방지가 보장되지 않는다.
     */
    try {
      await recordCiImport(prisma, {
        projectId: project.id,
        pushTokenHash: tokenHash,
        executionId: parsed.data.executionId ?? randomUUID(),
        surface: { id: surface.id, slug: surface.slug },
        result: "failed",
        errorCode: parsed.data.code,
        surfaces: [{ surfaceSlug: surface.slug, status: "failed", count: null, reason: parsed.data.code }],
      });
    } catch (error) {
      // 보고 수신은 이미 성공했다 — 여기서 던지면 204가 500이 되고 CI가 원인을 오진한다.
      logFailure("push-failure-event", error);
    }

    /**
     * 목록 **둘**과 그 설정이 이 값을 읽는다. ⚠️ `/projects`가 접두가 아니라 경로 하나라
     * `/projects/new`를 따로 지운다 (POSTMORTEM 2026-09-09).
     */
    revalidatePath("/projects");
    revalidatePath("/projects/new");
    revalidatePath(`/projects/${project.slug}/settings`);
    /**
     * ⚠️ **Home도 이 컬럼에서 파생되는 판정을 부른다** (2026-09-15 — project-home T10). 세는 축은
     * "이 Action이 쓰는 컬럼을 읽는 화면"이 아니라 **"그 컬럼에서 파생되는 판정 함수를 부르는
     * 화면"**이다 (POSTMORTEM 2026-09-09 🔁 2026-09-11): Home이 `failing`의 새 소비자가 되면서
     * 배너·항목·메타의 실패 시각이 전부 이 쓰기에 달렸다.
     */
    revalidatePath(`/projects/${project.slug}`, "layout");

    // 돌려줄 것이 없다 — 보고자는 이 응답으로 아무 결정도 하지 않는다(어차피 exit 1이다).
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    // `/api/push`와 같은 규칙 — 남의 라이브러리 메시지는 `ref`만 내보낸다. 이 응답은 **임의의 대상
    // 리포**의 Actions 로그로 흘러가고 그 리포가 public이면 누구나 읽는다.
    const failure = classifyFailure(error);
    if (failure.safe) return NextResponse.json({ error: failure.message }, { status: 500 });
    const ref = randomUUID().slice(0, 8);
    console.error(`[push-failure] ${ref} ${failure.detail}`);
    return NextResponse.json({ error: "internal", ref }, { status: 500 });
  }
}
