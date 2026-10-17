import type { Prisma } from "@/generated/prisma/client";
import type { LocaleChangeSubtype } from "@/lib/events/payload";
import type { EventActorInput } from "@/lib/events/record";
import { recordEvents } from "@/lib/events/record";
import { reviewNumberFrom } from "@/lib/projects/remote-plan";

import { normalizeLocaleEffects, type LocaleEffect } from "./effects";
import { planLocaleExpiry, type ExpiredLocale, type ExpiryHold, type PullRequestCheck } from "./expiry";
import { readLocaleStates } from "./work";

/**
 * **언어 변경 의도 만료의 I/O 껍데기** (locale-add design §1 "만료와 strict 적재" — orch O4). 자동 적재(B3)·같은 SHA 야간 방문(B3)·
 * Publish 스냅샷 전(B2)이 부른다. 판정은 순수 함수 `planLocaleExpiry` 하나이고, 여기서는 잠금 뒤 다시 읽은 행·목록을 넘기고 결과대로
 * 행 삭제·전달 목록에서 그 효과 빼기·활성/orphan·사건을 **호출자의 tx**에 쓴다.
 *
 * ⚠️ **스스로 `Project`→`TranslationSurface`를 잠근다** — 같은 tx에서 이미 잠갔으면 다시 잡아도 대기하지 않는다. 잠금 전에 읽은 원격
 * 관측(PR 상태·base 파일)은 입력이지만 DB 상태는 잠금 뒤 값이어야 한다(POSTMORTEM 2026-10-07 "야간 원격 관측을 최신으로 취급").
 * ⚠️ **보류는 쓰지 않는다** — 행·로케일·사건 모두 그대로다. 보류 사유는 호출자의 실행 사건(적재 deferred · 야간 결과 · Publish)이 싣는다.
 * ⚠️ `base-empty`(관측 로케일 0개)는 **`base-unreadable`로 접어 돌려준다** — 둘 다 "base를 근거로 쓸 수 없다"는 보류이고, 사건·Logs에
 * 갈래를 둘로 만들 이유가 없다(A1 handoff). 판정 자체는 `planLocaleExpiry`가 가른다.
 * ⚠️ `server-only`를 붙이지 않는다 — 격리 PG 통합 테스트가 직접 부른다.
 */

export type LocaleExpiryHold = Exclude<ExpiryHold, "base-empty">;

export type LocaleExpiryInput = {
  projectId: string;
  surfaceId: string;
  /** 사건 payload의 소스 이름 — 사건 당시 값이다. */
  surfaceSlug: string;
  /** 성공한 조회만 `none-open`이다. 실패·응답 유실·상태 불명은 `failed`(수락 기준 15). */
  pullRequest: PullRequestCheck;
  /** base head에서 관측한 이 소스의 로케일 — strict 적재의 `payload.locales`와 같은 뜻이다. 못 읽었으면 `unreadable`. */
  observed: { status: "observed"; locales: readonly string[] } | { status: "unreadable" };
  actor: EventActorInput;
};

export type LocaleExpiryResult = { expired: ExpiredLocale[]; held: LocaleExpiryHold | null };

export async function expireLocaleChanges(tx: Prisma.TransactionClient, input: LocaleExpiryInput): Promise<LocaleExpiryResult> {
  const { projectId, surfaceId } = input;
  await tx.$executeRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`;
  await tx.$executeRaw`SELECT "id" FROM "TranslationSurface" WHERE "projectId" = ${projectId} AND "id" = ${surfaceId} FOR UPDATE`;
  const [state] = await readLocaleStates(tx, projectId, surfaceId);
  if (state === undefined || state.rows.length === 0) return { expired: [], held: null };
  const plan = planLocaleExpiry({
    pullRequest: input.pullRequest,
    current: state.current,
    delivered: state.delivered,
    rows: state.rows.map(row => ({ localeCode: row.localeCode, operation: row.operation, orphaned: row.orphaned })),
    observed: input.observed,
  });
  if (plan.expired.length > 0) {
    const expiredCodes = new Set(plan.expired.map(item => item.localeCode));
    await tx.localeChange.deleteMany({ where: { projectId, surfaceId, localeCode: { in: [...expiredCodes] } } });
    // 만료된 효과는 더 이상 어느 PR에도 실려 있지 않다 — 전달 목록에 남기면 같은 언어를 다시 요청했을 때 현재 = 전달이 되어 Publish가 싣지 않고,
    // 다음 방문이 그 요청을 지운다(#266). 무효화 중(`null`)인 목록은 무엇이 실렸는지 모르므로 건드리지 않는다.
    // ⚠️ `revision`은 그대로 둔다 — 새 전달 관측이 아니다. 자동 적재·야간 만료의 장벽(`readDeliveryRevision`)이 revision 변화를 "Publish가 끼었다"로
    // 읽으므로, 바꾸면 사전 판정을 마친 다른 소스의 적재가 이유 없이 `publish-raced`로 보류된다(`surfaces/remove.ts`도 목록만 쓴다).
    // 저장된 목록에서 뺀다 — 판정용 목록(`delivered`)으로 쓰면 확인 뒤 요청 코드의 옛 효과도 함께 지워진다. 만료는 열린 PR 없음을 확인한 뒤에만
    // 돌아 그 효과는 어느 PR에도 없으므로 해는 없지만(그 요청을 나중에 취소할 때 수렴 Publish가 한 번 줄 뿐), 저장값의 되쓰기가 판정 규칙에 기대지 않게 한다.
    if (state.storedDelivered !== null && state.storedDelivered.some(effect => expiredCodes.has(effect.localeCode))) {
      const kept = normalizeLocaleEffects(state.storedDelivered.filter(effect => !expiredCodes.has(effect.localeCode)));
      await tx.deliveryConfirmation.updateMany({ where: { projectId, surfaceId }, data: { deliveredLocaleChanges: kept } });
    }
    for (const presence of ["active", "orphan"] as const) {
      const codes = plan.expired.filter(item => item.presence === presence).map(item => item.localeCode);
      if (codes.length === 0) continue;
      // strict 적재와 같은 존재 판정이다 — orphan이면 `isBase`도 내린다(`lib/push/apply.ts`의 orphan 문장과 같은 결).
      await tx.locale.updateMany({ where: { projectId, surfaceId, code: { in: codes } }, data: presence === "active" ? { orphaned: false } : { orphaned: true, isBase: false } });
    }
    const pullRequest = await carriedBy(tx, input, state.delivered);
    await recordEvents(tx, plan.expired.map(item => ({
      projectId,
      subtype: "surface.localeChangeResolved" satisfies LocaleChangeSubtype,
      actor: input.actor,
      surfaceIds: [surfaceId],
      payload: { kind: "SURFACE" as const, surfaceSlug: input.surfaceSlug, adapter: null, baseLocale: null,
        localeChange: { locale: item.localeCode, operation: item.operation, revived: null, discarded: null, outcome: item.presence, reissued: null,
          pullRequest: pullRequest(item) } },
    })));
  }
  return { expired: plan.expired, held: plan.held === "base-empty" ? "base-unreadable" : plan.held };
}

/**
 * 만료된 의도를 실었던 PR/MR 번호 — 그 효과(ADD → create · REMOVE → delete)가 판정용 전달 목록에 있을 때만 마지막 전달 확인 실행의 저장된 주소에서 뽑는다.
 * 목록에 없던 의도(모순 행·리포에서 직접 추가된 언어)는 어느 PR에도 실리지 않았다. 만료는 열린 PR이 없을 때만 돌므로 그 주소는 방금 닫힌 PR이다.
 * ⚠️ 호스트를 부르지 않는다 — 관측이 아니라 기록된 주소다. 세 호출부(야간·Publish·CI)가 이 한 곳을 지난다.
 */
async function carriedBy(tx: Prisma.TransactionClient, input: LocaleExpiryInput, delivered: readonly LocaleEffect[] | null) {
  const confirmation = await tx.deliveryConfirmation.findUnique({
    where: { projectId_surfaceId: { projectId: input.projectId, surfaceId: input.surfaceId } },
    select: { syncRun: { select: { prUrl: true } }, surface: { select: { project: { select: { repoHost: true } } } } },
  });
  const number = confirmation === null ? null : reviewNumberFrom(confirmation.syncRun.prUrl, confirmation.surface.project.repoHost);
  return (item: ExpiredLocale): { number: number } | null => {
    const effect = item.operation === "ADD" ? "create" : "delete";
    return number !== null && (delivered ?? []).some(entry => entry.localeCode === item.localeCode && entry.effect === effect) ? { number } : null;
  };
}
