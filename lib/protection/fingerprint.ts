import { createHash, timingSafeEqual } from "node:crypto";

/**
 * 수동 Sync 폐기 승인 지문 (sync-edit-protection design §4.1).
 *
 * **HMAC·만료가 없다.** 토큰 원문이 서버 밖으로 나가지 않으므로(§2) 클라이언트는 지문을 위조할 수 없고, 재사용은
 * 상태 변화(새 편집·적용·설정 변경)가 지문을 바꿔 막는다. 서버는 잠금 **뒤** 같은 입력으로 재계산해 대조한다
 * (POSTMORTEM 2026-09-13 "일회용 연결 요청을 락 전에 읽었다").
 *
 * ⚠️ `./plan`과 분리한 이유는 `node:crypto`다 — 판정 모듈은 화면이 값으로 읽는다.
 */

export type DiscardFingerprintInput = {
  userId: string;
  projectId: string;
  surfaces: readonly { id: string; importRevision: number; adapterName: string | null; pathTemplate: string | null; baseLocale: string | null }[];
  pending: readonly { id: string; token: string }[];
};

export function discardFingerprint(input: DiscardFingerprintInput): string {
  const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  // 배열 튜플로 직렬화한다 — 구분자 이어붙이기는 `id|token` 경계가 움직인 두 입력을 같은 문자열로 만든다.
  const canonical = JSON.stringify([
    input.userId,
    input.projectId,
    [...input.surfaces].sort(byId).map(s => [s.id, s.importRevision, s.adapterName, s.pathTemplate, s.baseLocale]),
    [...input.pending].sort(byId).map(p => [p.id, p.token]),
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

export function sameFingerprint(approved: string | null, current: string): boolean {
  if (approved === null) return false;
  const a = Buffer.from(approved);
  const b = Buffer.from(current);
  // `timingSafeEqual`은 길이가 다르면 던진다 — 길이는 공개 정보(sha256 hex 고정)라 먼저 걸러도 새는 것이 없다.
  return a.length === b.length && timingSafeEqual(a, b);
}
