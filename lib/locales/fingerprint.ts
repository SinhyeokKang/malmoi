import { createHash } from "node:crypto";

/**
 * **언어 제거·추가 취소 승인 지문** (locale-add design §2 — 수동 Sync·소스 제거 지문과 같은 형: HMAC·만료 없음, 잠금 뒤 재계산).
 *
 * 묶는 것: 그 언어의 변경 행(요청 시각까지) · 그 언어 셀 토큰 전부 · 소스 설정 · 그 소스의 전달 확인(revision·무효화). 마지막 것은 미리보기가
 * 말한 전달 상태가 실행 전에 바뀌면(사이에 Publish가 확인됨) 승인을 낡게 한다(R-B1 W1). 용도 접두 `"locale-change"`가 다른 승인과 가른다 —
 * 같은 토큰 집합의 Sync·소스 제거 승인이 여기서 통과하지 않는다. 대조는 `sameFingerprint`(`lib/protection/fingerprint.ts`)다.
 *
 * ⚠️ **토큰은 그 소스·언어 전체다 — orphan 키 포함** (POSTMORTEM "세는 집합 ≠ 바꾸는 집합"). 폐기가 바꾸는 집합과 같아야 확인 창이
 * 말하지 않은 편집이 버려지지 않는다.
 */
export type LocaleChangeFingerprintInput = {
  userId: string;
  projectId: string;
  surfaceId: string;
  localeCode: string;
  /** 그 언어의 `LocaleChange` 행. `requestedAt`은 ISO — 취소 뒤 같은 요청을 다시 낸 행을 옛 승인과 가른다. */
  change: { operation: "ADD" | "REMOVE"; requestedAt: string } | null;
  /** `basePath`는 값이 있을 때만 튜플에 붙는다 — null 소스의 지문 바이트가 그대로다(mobile-strings design §2). */
  surface: { adapterName: string | null; pathTemplate: string | null; baseLocale: string | null; declaredBaseLocale: string | null; basePath: string | null };
  /** 그 소스의 `DeliveryConfirmation` — 행이 없으면 `null`. */
  delivery: { revision: string; invalidated: boolean } | null;
  pending: readonly { id: string; token: string }[];
};

export function localeChangeFingerprint(input: LocaleChangeFingerprintInput): string {
  const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  // 배열 튜플로 직렬화한다 — 구분자 이어붙이기는 `id|token` 경계가 움직인 두 입력을 같은 문자열로 만든다.
  const canonical = JSON.stringify([
    "locale-change",
    input.userId,
    input.projectId,
    input.surfaceId,
    input.localeCode,
    input.change === null ? null : [input.change.operation, input.change.requestedAt],
    [input.surface.adapterName, input.surface.pathTemplate, input.surface.baseLocale, input.surface.declaredBaseLocale, ...withBasePath(input.surface.basePath)],
    input.delivery === null ? null : [input.delivery.revision, input.delivery.invalidated],
    [...input.pending].sort(byId).map(p => [p.id, p.token]),
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

/** basePath가 있을 때만 튜플 끝에 붙인다 — 기존(null) 소스의 지문 바이트를 바꾸지 않는다. */
function withBasePath(basePath: string | null): string[] {
  return basePath === null ? [] : [basePath];
}
