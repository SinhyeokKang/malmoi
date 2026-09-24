import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { getPrisma } from "@/lib/db";
import { classifyFailure, fail } from "@/lib/failure";
import { optionalEnv } from "@/lib/env";
import { checkBearer, statusFor } from "@/lib/push/auth";
import { PULL_BATCH_LIMIT, PULL_TIME_BUDGET_MS, selectPullTargets, type PullItem } from "@/lib/pull/targets";
import { runSync } from "@/lib/sync/run";

/**
 * DB → `malmoi-i18n/sync` PR. **cron 전용 진입점이다** — 편집 UI는 Server Action이 `triggerPull`을
 * 직접 부른다 (CLAUDE.md "데이터 변경 경로", 내부 쓰기에 Route Handler를 새로 만들지 않는다).
 *
 * ⚠️ **`middleware.ts`의 matcher에 넣지 않는다.** cron 요청엔 세션이 없다. 현재 matcher는
 * `/projects/:path*`뿐이라 기본값이 안전하지만, 보호 라우트를 넓힐 때 이 경로를 함께 넣으면
 * 야간 pull이 조용히 리다이렉트된다.
 *
 * ⚠️ **준비된 프로젝트 전부를 순회한다** (2026-09-07, ARCHITECTURE §3.05). 전에는 서버 env 하나가 대상을
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
  const startedAt = Date.now();
  try {
    const prisma = getPrisma();
    // 순회 대상은 판정층이 고른다 (`lib/pull/targets.ts`) — 준비 안 된 프로젝트를 돌리면 던진다.
    const projects = await prisma.project.findMany({
      select: {
        id: true,
        slug: true,
        installationId: true,
        repositoryId: true,
        surfaces: { select: { archivedAt: true, lastCommitSha: true } },
        // 보관 제외 (7단계) — 순회 대상에서 빠지므로 게이트까지 가지도 않는다.
        archivedAt: true,
        // ⚠️ **정렬 재료다** — 마지막 실행이 오래된 프로젝트부터 돈다. 상한에서 잘린 뒤쪽이
        // 매일 밤 같은 프로젝트면 그것은 영원히 안 돈다 (`selectPullTargets`).
        syncRuns: { take: 1, orderBy: { startedAt: "desc" }, select: { startedAt: true } },
      },
    });

    // ⚠️ **상한이 붙었다** (2026-09-09, sec-audit 발견 26) — 못 돈 수가 응답과 로그에 실린다.
    const selected = selectPullTargets(projects, PULL_BATCH_LIMIT);
    let unprocessed = selected.unprocessed;
    const byslug = new Map(projects.map((p) => [p.slug, p.id]));
    const results: PullItem[] = [];
    for (const [index, slug] of selected.targets.entries()) {
      // ⚠️ **예산을 넘으면 나머지를 시작하지 않는다** (`PULL_TIME_BUDGET_MS`) — `maxDuration`에 죽으면 아래 요약이
      // 통째로 사라진다. 시작 전 판정이라 첫 프로젝트는 항상 돈다.
      if (index > 0 && Date.now() - startedAt > PULL_TIME_BUDGET_MS) {
        unprocessed += selected.targets.length - index;
        break;
      }
      // ⚠️ **프로젝트마다 잡는다.** 한 프로젝트의 GitHub 장애가 나머지의 편집을 다음 밤까지 묶어두면
      // 안 된다. `lastPulledAt`은 성공한 프로젝트에만 쓰이므로 실패가 편집을 잃지 않는다.
      //
      // ⚠️ 격리의 실제 경계는 루프 본문이 **아니라 이 catch 본문까지**다 — 여기서 무엇이든 던지면
      // 바깥 catch가 받아 이미 모은 결과가 통째로 버려지고 500이 된다. `failureItem`은 순수 판정과
      // 로그뿐이라 던질 것이 없다.
      //
      // ⚠️ **`runSync`는 던지지 않는다** (7단계) — 실패도 게이트 거부도 값이다. 그래도 `try`를 남기는
      // 이유는 그 함수의 DB 쓰기(행 생성·닫기)가 여전히 던질 수 있어서다.
      try {
        // 인가를 지날 일이 없는 경로다 — `projectId`는 방금 조회한 행의 것이고 slug는 로그용이다.
        // ⚠️ **부재를 조용히 건너뛰지 않는다.** `targets`가 같은 배열에서 나오므로 일어날 수 없지만,
        // 일어난다면 그 프로젝트는 결과에서 **흔적 없이 사라지고** 요약의 `targets` 수와 어긋난다 —
        // 이 리포가 반복해 밟은 "실패한 조회를 없음으로 읽는" 형태다 (POSTMORTEM 2026-09-03).
        const projectId = byslug.get(slug) ?? fail(`no project row for target: ${slug}`);
        results.push({
          slug,
          ...(await runSync(prisma, { projectId, slug, trigger: "cron", requestedBy: null })),
        });
      } catch (error) {
        results.push(failureItem(slug, error));
      }
    }

    // ⚠️ **요약을 한 줄 남긴다.** 응답이 항상 200 배열이라 cron 실행은 성공으로 표시되고, cron은 본문을
    // 버린다 — 요약이 없으면 "전 프로젝트가 매일 밤 실패한다"가 성공과 같은 관측값이 된다
    // (POSTMORTEM 2026-09-06의 형태). 로그 grep 하나로 잡히는 자리를 만든다.
    const failed = results.filter((r) => r.status === "failed").length;
    console.log(`[pull] targets=${results.length} failed=${failed} unprocessed=${unprocessed}`);
    // ⚠️ **미처리를 배열 밖에 싣는다** — 항목으로 섞으면 `PullItem` 계약이 흔들리고, 소비자가
    // 그것을 프로젝트 하나로 센다. 0이어도 필드를 뺀 적이 없어야 부재와 0이 구별된다.
    return NextResponse.json({ results, unprocessed });
  } catch (error) {
    // ⚠️ **던진 메시지를 그대로 싣지 않는다** (2026-09-04 audit #15). 우리가 만든 오류
    // (`MissingEnvError` — 변수 이름만 담는다)는 본문에 남긴다: 그게 POSTMORTEM 2026-09-03이
    // 요구한 "원인이 남는 500"이다. 남의 라이브러리 메시지는 `ref`만 내보내고, **서버 로그에도
    // 갈래 이름만** 남는다(2026-09-18 — `classifyFailure` 주석). 이 응답은 **임의의 대상 리포**의
    // Actions 로그로 흘러가고(`scripts/push-local.ts`가 stdout에 찍는다) 그 리포가 public이면
    // 누구나 읽는다.
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
 * (ARCHITECTURE §6.0).
 *
 * ⚠️ **두 갈래 모두 로그한다** (2026-09-07 code-review 🔴1). 전에는 safe 갈래가 조용히 반환했는데,
 * `lib/pull/**`의 실패 **대부분이 safe다** — "base 브랜치를 읽을 수 없다"(App 제거·설치 일시중지·접근
 * 철회), 포맷 컬럼 누락, 로케일 0개가 전부 `fail()`이다. 응답은 200 배열이고 cron은 본문을 버리므로
 * 그 상태면 **전면 장애가 성공과 구별되지 않는다.** 2026-09-06 개인키 사고의 증상이 정확히 그 문구였다.
 * `trigger.ts`가 warnings를 `console.warn`으로 남기는 것과 같은 이유이고, 실패는 경고보다 무겁다.
 */
function failureItem(slug: string, error: unknown): PullItem {
  const failure = classifyFailure(error);
  if (failure.safe) {
    console.error(`[pull:${slug}] ${failure.message}`);
    return { slug, status: "failed", error: failure.message };
  }
  const ref = randomUUID().slice(0, 8);
  console.error(`[pull:${slug}] ${ref} ${failure.detail}`);
  return { slug, status: "failed", ref };
}
