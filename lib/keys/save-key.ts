import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@/generated/prisma/client";
import type { LockedAccess } from "@/lib/auth/access";
import { lockProjectAccess } from "@/lib/auth/lock";
import { recordEvent } from "@/lib/events/record";
import { planBaselineOnSave } from "@/lib/translations/baseline";

import { publishInFlight, readDeliveryState } from "./delivery";
import { planKeySave, type KeySavePlan } from "./save";

/**
 * **키 단위 저장** (translation-rework T10 — spec §3.4 · design §4). 선택 키의 바뀐 로케일 전부를 한 트랜잭션으로 쓴다.
 *
 * ⚠️ **전부 계획한 뒤에만 쓴다**(`planKeySave`) — 셀 루프 도중 거부하면 앞 셀이 커밋될 수 있다. 사건 기록이 실패하면 전부 롤백이다.
 * ⚠️ **나중 저장이 최종 값이다** — 버전 비교·충돌 거부를 넣지 않는다(사용자 확정).
 * ⚠️ 잠금은 `Project` → `TranslationSurface`다 — CI 적재·수동 Sync·Publish 성공 확정과 같은 순서라 교착하지 않는다.
 * ⚠️ `server-only`를 붙이지 않는다 — 격리 PG 통합 테스트가 직접 부른다.
 * ⚠️ **인가는 잠금 뒤 한 번 더 본다** (감사 #10) — Action 입구 판정 뒤 적재 잠금을 최대 30초 기다리는 동안 제거된 EDITOR의
 *   저장·사건이 커밋되면 안 된다.
 */
export type KeySaveResult =
  | { ok: true; keyId: string; cells: { localeCode: string; value: string }[] }
  | Exclude<KeySavePlan, { ok: true }>
  | { ok: false; error: "key-unavailable" }
  | { ok: false; error: Exclude<LockedAccess, { status: "ok" }>["status"] };

export async function applyKeySave(
  prisma: PrismaClient,
  input: { projectId: string; surfaceId: string; surfaceSlug: string; keyId: string; userId: string; changes: readonly { localeCode: string; value: string }[] },
): Promise<KeySaveResult> {
  const { projectId, surfaceId, surfaceSlug, keyId, userId } = input;
  return prisma.$transaction(async (tx) => {
    const locked = await lockProjectAccess(tx, { projectId, userId, permission: "translation:write", surfaceId });
    if (locked.status !== "ok") return { ok: false, error: locked.status } as const;

    // 인가가 준 projectId·surfaceId로 다시 좁힌다 — 멤버십은 "이 keyId가 그 프로젝트 것"을 뜻하지 않는다.
    const key = await tx.stringKey.findFirst({ where: { id: keyId, projectId, surfaceId, orphaned: false }, select: { key: true, sourceText: true } });
    if (key === null) return { ok: false, error: "key-unavailable" } as const;
    const surface = await tx.translationSurface.findFirstOrThrow({ where: { id: surfaceId, projectId }, select: { baseLocale: true } });
    const locales = await tx.locale.findMany({ where: { projectId, surfaceId, orphaned: false }, select: { code: true } });
    const rows = await tx.translation.findMany({ where: { projectId, surfaceId, keyId }, select: { localeCode: true, value: true, pendingEditToken: true } });
    const rowOf = new Map(rows.map(row => [row.localeCode, row]));

    const plan = planKeySave(new Map(locales.map(l => [l.code, rowOf.get(l.code)?.value ?? null])), input.changes);
    if (!plan.ok) return plan;
    if (plan.writes.length === 0) return { ok: true, keyId, cells: [] };

    const delivery = await readDeliveryState(tx, projectId, surfaceId);
    const inFlight = await publishInFlight(tx, projectId);
    for (const write of plan.writes) {
      const before = rowOf.get(write.localeCode);
      const baseline = planBaselineOnSave({
        changed: true,
        wasPending: (before?.pendingEditToken ?? null) !== null,
        confirmationValid: delivery?.valid ?? false,
        publishInFlight: inFlight,
        // 실제 적용 base로 판정한다 — 선언만 바뀐 base는 export에 쓰이지 않았다.
        before: { value: before?.value ?? null, isBase: surface.baseLocale === write.localeCode, sourceText: key.sourceText },
      });
      // 편집 토큰은 값이 실제로 바뀐 셀에만 새로 쓴다 — Publish가 캡처한 토큰과 달라야 전달 확인 CAS가 이 저장을 해제하지 않는다.
      const pendingEditToken = randomUUID();
      await tx.translation.upsert({
        where: { keyId_localeCode: { keyId, localeCode: write.localeCode }, projectId, surfaceId },
        create: { projectId, surfaceId, keyId, localeCode: write.localeCode, value: write.value, needsReview: false, updatedBy: userId, pendingEditToken },
        update: { value: write.value, needsReview: false, updatedBy: userId, pendingEditToken },
      });
      if (baseline.record && delivery !== null) {
        const cell = { projectId, surfaceId, keyId, localeCode: write.localeCode };
        await tx.translationBaseline.upsert({
          where: { projectId_surfaceId_keyId_localeCode: cell },
          create: { ...cell, restoreValue: baseline.restoreValue, revision: delivery.revision },
          update: { restoreValue: baseline.restoreValue, revision: delivery.revision, recordedAt: new Date() },
        });
      }
      await recordEvent(tx, {
        projectId,
        subtype: "translation.saved",
        actor: { kind: "USER", userId },
        surfaceIds: [surfaceId],
        // 잠금 뒤에 읽은 값이다 — 그래서 `before`가 실제로 내가 덮은 값이다.
        payload: { kind: "TRANSLATION", surfaceSlug, key: key.key, locale: write.localeCode, before: before?.value ?? null, after: write.value },
      });
    }
    return { ok: true, keyId, cells: plan.writes };
  }, { maxWait: 10_000, timeout: 30_000 });
}
