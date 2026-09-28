import { randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ADAPTERS } from "@/lib/adapters";
import type { LockedAccess } from "@/lib/auth/access";
import { lockProjectAccess } from "@/lib/auth/lock";
import { recordEvents } from "@/lib/events/record";
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

type KeyChanges = readonly { localeCode: string; value: string }[];
type KeySaveTarget = { projectId: string; surfaceId: string; surfaceSlug: string; userId: string; tokenId: string | undefined };
/** 잠금 뒤 인가를 지난 한 키의 결과 — 접근 거부는 배치 전체의 결과라 여기 없다. */
export type KeyEntryResult = Exclude<KeySaveResult, { ok: false; error: Exclude<LockedAccess, { status: "ok" }>["status"] }>;

export async function applyKeySave(
  prisma: PrismaClient,
  input: KeySaveTarget & { keyId: string; changes: KeyChanges },
): Promise<KeySaveResult> {
  const { projectId, surfaceId, userId, tokenId } = input;
  return prisma.$transaction(async (tx) => {
    const locked = await lockProjectAccess(tx, { projectId, userId, permission: "translation:write", surfaceId, tokenId });
    if (locked.status !== "ok") return { ok: false, error: locked.status } as const;
    const [result] = await saveKeysLocked(tx, input, [{ keyId: input.keyId, changes: input.changes }]);
    return result!;
  }, { maxWait: 10_000, timeout: 30_000 });
}

export type KeyBatchSaveResult =
  | { ok: true; results: { keyId: string; result: KeyEntryResult }[] }
  | { ok: false; error: Exclude<LockedAccess, { status: "ok" }>["status"] };

/**
 * **여러 키를 한 잠금·한 트랜잭션으로 저장한다** (mcp-connector design §2.2 — `set_translations`). 잠금·인가 재확인은 배치에 한 번이고
 * 키마다 `applyKeySave`와 같은 판정(`saveKeysLocked`)을 돌려 결과를 입력 순서대로 모은다. **거부된 키는 그 키만 건너뛴다** — 일부 키의
 * 거부가 정상 결과다. DB 실패는 던지고 앞 키까지 전부 롤백된다.
 *
 * ⚠️ 키별 tx가 아닌 이유: 잠금 tx 실측이 키당 0.5–0.7초라 100키가 60초 안에 못 든다. 한 tx 안의 읽기는 상수 번이다(`saveKeysLocked` — #145).
 * ⚠️ 상한·중복 키 거부는 호출자의 입력 검증이다(`planBatchSave`) — 여기는 검증된 목록을 받는다.
 */
export async function applyKeySaveBatch(
  prisma: PrismaClient,
  input: KeySaveTarget & { entries: readonly { keyId: string; changes: KeyChanges }[] },
): Promise<KeyBatchSaveResult> {
  const { projectId, surfaceId, userId, tokenId } = input;
  return prisma.$transaction(async (tx) => {
    const locked = await lockProjectAccess(tx, { projectId, userId, permission: "translation:write", surfaceId, tokenId });
    if (locked.status !== "ok") return { ok: false, error: locked.status } as const;
    const results = await saveKeysLocked(tx, input, input.entries);
    return { ok: true, results: input.entries.map((entry, index) => ({ keyId: entry.keyId, result: results[index]! })) } as const;
  }, { maxWait: 10_000, timeout: 30_000 });
}

type EntryInput = { keyId: string; changes: KeyChanges };
type Cell = { value: string; pendingEditToken: string | null };

/**
 * 잠금·인가 재확인을 지난 tx 안에서 키들을 판정하고 쓴다 — 단건·배치가 같은 함수를 지나야 화면과 도구의 판정이 한 벌이다.
 *
 * ⚠️ **읽기는 키 수와 무관하게 상수 번이다** (#145) — 원격 DB(도쿄)에서 왕복 하나가 수십 ms라 키마다 읽으면 100키가 30초 tx를 넘었다(키당 ~8
 * 왕복, 실측 0.45초/키). 키·셀·표면·로케일·전달 확인·진행 중 Publish를 잠금 뒤 한 번에 읽고, 키마다 **같은 순수 판정**(`planKeySave`·
 * `planBaselineOnSave`)을 돈 뒤 쓴다. 새 셀은 한 `createMany`, 사건은 한 `createMany`다 — 키마다 남는 것은 기존 셀의 UPDATE와(드문) 복원 기준뿐이다.
 * ⚠️ 같은 키가 두 번 오면 앞 저장을 뒤 판정이 봐야 한다 — 읽어 둔 셀 지도를 쓰기와 함께 갱신한다(DB를 다시 읽지 않는다).
 */
async function saveKeysLocked(tx: Prisma.TransactionClient, target: KeySaveTarget, entries: readonly EntryInput[]): Promise<KeyEntryResult[]> {
  const { projectId, surfaceId, surfaceSlug, userId } = target;
  const keyIds = [...new Set(entries.map(entry => entry.keyId))];
  if (keyIds.length === 0) return [];
  // 인가가 준 projectId·surfaceId로 다시 좁힌다 — 멤버십은 "이 keyId가 그 프로젝트 것"을 뜻하지 않는다.
  const keys = await tx.stringKey.findMany({ where: { id: { in: keyIds }, projectId, surfaceId, orphaned: false }, select: { id: true, key: true, sourceText: true } });
  const keyOf = new Map(keys.map(key => [key.id, key]));
  const surface = await tx.translationSurface.findFirstOrThrow({ where: { id: surfaceId, projectId }, select: { baseLocale: true, adapterName: true } });
  // 비우기 판정의 입력이라 잠금 안에서 읽는다(delivery-invariants D2). 모르는 어댑터는 수술적으로 친다 — 비우기를 막는 쪽이 안전하다.
  const writeStrategy = ADAPTERS.find(adapter => adapter.name === surface.adapterName)?.writeStrategy ?? "surgical";
  const locales = await tx.locale.findMany({ where: { projectId, surfaceId, orphaned: false }, select: { code: true } });
  const rows = keys.length === 0 ? [] : await tx.translation.findMany({
    where: { projectId, surfaceId, keyId: { in: keys.map(key => key.id) } },
    select: { keyId: true, localeCode: true, value: true, pendingEditToken: true },
  });
  const cellKey = (keyId: string, localeCode: string) => `${keyId}\u0000${localeCode}`;
  const cells = new Map<string, Cell>(rows.map(row => [cellKey(row.keyId, row.localeCode), { value: row.value, pendingEditToken: row.pendingEditToken }]));
  /** 이 배치가 새로 만든 셀 — 끝에서 한 `createMany`로 쓴다. 같은 셀을 다시 쓰면 이 행을 고친다(아직 DB에 없다). */
  const creates = new Map<string, Prisma.TranslationCreateManyInput>();
  const events: Parameters<typeof recordEvents>[1][number][] = [];
  // 전달 확인·진행 중 Publish는 쓰기가 있을 때만 읽는다 — 전부 거부·no-op인 배치는 왕복을 더하지 않는다(이전과 같다).
  let delivery: Awaited<ReturnType<typeof readDeliveryState>> | undefined;
  let inFlight = false;

  const results: KeyEntryResult[] = [];
  for (const { keyId, changes } of entries) {
    const key = keyOf.get(keyId);
    if (key === undefined) { results.push({ ok: false, error: "key-unavailable" }); continue; }
    const plan = planKeySave(new Map(locales.map(l => [l.code, cells.get(cellKey(keyId, l.code))?.value ?? null])), changes, { writeStrategy, baseLocale: surface.baseLocale });
    if (!plan.ok) { results.push(plan); continue; }
    if (plan.writes.length === 0) { results.push({ ok: true, keyId, cells: [] }); continue; }
    if (delivery === undefined) {
      delivery = await readDeliveryState(tx, projectId, surfaceId);
      inFlight = await publishInFlight(tx, projectId);
    }
    for (const write of plan.writes) {
      const id = cellKey(keyId, write.localeCode);
      const before = cells.get(id);
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
      const pending = creates.get(id);
      if (pending !== undefined) Object.assign(pending, { value: write.value, updatedBy: userId, pendingEditToken });
      else if (before === undefined) creates.set(id, { projectId, surfaceId, keyId, localeCode: write.localeCode, value: write.value, needsReview: false, updatedBy: userId, pendingEditToken });
      else await tx.translation.updateMany({ where: { projectId, surfaceId, keyId, localeCode: write.localeCode }, data: { value: write.value, needsReview: false, updatedBy: userId, pendingEditToken } });
      cells.set(id, { value: write.value, pendingEditToken });
      if (baseline.record && delivery !== null) {
        const cell = { projectId, surfaceId, keyId, localeCode: write.localeCode };
        await tx.translationBaseline.upsert({
          where: { projectId_surfaceId_keyId_localeCode: cell },
          create: { ...cell, restoreValue: baseline.restoreValue, revision: delivery.revision },
          update: { restoreValue: baseline.restoreValue, revision: delivery.revision, recordedAt: new Date() },
        });
      }
      events.push({
        projectId,
        subtype: "translation.saved",
        actor: { kind: "USER", userId },
        surfaceIds: [surfaceId],
        // 잠금 뒤에 읽은 값이다 — 그래서 `before`가 실제로 내가 덮은 값이다(같은 배치의 앞 저장이면 그 값이다).
        payload: { kind: "TRANSLATION", surfaceSlug, key: key.key, locale: write.localeCode, before: before?.value ?? null, after: write.value },
      });
    }
    results.push({ ok: true, keyId, cells: plan.writes });
  }
  if (creates.size > 0) await tx.translation.createMany({ data: [...creates.values()] });
  // 사건 기록이 실패하면 전부 롤백이다 — 같은 tx다.
  await recordEvents(tx, events);
  return results;
}
