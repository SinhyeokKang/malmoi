import { createHash, timingSafeEqual } from "node:crypto";

/**
 * 수동 Sync 폐기 승인 지문 (sync-edit-protection — ARCHITECTURE §5.5.2의 폐기 승인).
 *
 * **HMAC·만료가 없다.** 토큰 원문이 서버 밖으로 나가지 않으므로(§2) 클라이언트는 지문을 위조할 수 없고, 재사용은
 * 상태 변화(새 편집·적용·설정 변경·리포/브랜치 변경)가 지문을 바꿔 막는다. 서버는 잠금 **뒤** 같은 입력으로 재계산해 대조한다
 * (POSTMORTEM 2026-09-13 "일회용 연결 요청을 락 전에 읽었다").
 *
 * ⚠️ `./plan`과 분리한 이유는 `node:crypto`다 — 판정 모듈은 화면이 값으로 읽는다.
 */

/**
 * 소스 하나의 **언어 변경 상태** (locale-add design §4 "집계·보호") — 의도 행(요청 시각까지)과 마지막 전달 목록(`null`은 확인 안 됨).
 * 수동 Sync가 의도 행을, 소스 제거가 행·전달 목록을 지우므로 승인에 묶는다 — 승인 뒤 추가·제거·취소·전달이 있으면 옛 승인이 통하지 않는다.
 */
export type LocaleChangeState = {
  surfaceId: string;
  rows: readonly { localeCode: string; operation: "ADD" | "REMOVE"; requestedAt: string }[];
  delivered: readonly { localeCode: string; effect: "create" | "delete" }[] | null;
};

/** 순서에 흔들리지 않는 직렬형 — 소스 id순, 그 안은 코드(·효과)순이다. 배열 튜플이라 구분자 모호성이 없다. */
function canonicalLocaleChanges(states: readonly LocaleChangeState[]): unknown[] {
  const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return [...states].sort((a, b) => order(a.surfaceId, b.surfaceId)).map(state => [
    state.surfaceId,
    [...state.rows].sort((a, b) => order(a.localeCode, b.localeCode)).map(row => [row.localeCode, row.operation, row.requestedAt]),
    state.delivered === null ? null : [...state.delivered].sort((a, b) => order(a.localeCode, b.localeCode) || order(a.effect, b.effect)).map(item => [item.localeCode, item.effect]),
  ]);
}

export type DiscardFingerprintInput = {
  userId: string;
  projectId: string;
  /**
   * ⚠️ **승인이 덮을 리포·브랜치다** (audit #3) — 표면 설정만 넣으면 `main` 기준으로 받은 승인이 기준 브랜치를 `release`로 바꾼 뒤에도
   * 통과해, OWNER가 본 적 없는 브랜치 값으로 편집을 덮는다. 연결·설정 변경은 revision을 올리지 않으므로 값 자체를 싣는다.
   */
  repository: { repoHost: string; repositoryId: string | null; installationId: string | null; gitlabConnectionId: string | null; repoOwner: string; repoName: string; baseBranch: string };
  /** `basePath`는 값이 있을 때만 튜플에 붙는다 — null 소스의 지문 바이트가 그대로다(mobile-strings design §2). */
  surfaces: readonly { id: string; importRevision: number; adapterName: string | null; pathTemplate: string | null; baseLocale: string | null; basePath: string | null }[];
  pending: readonly { id: string; token: string }[];
  /** 활성 소스의 언어 변경 상태 — 성공한 strict 적재가 의도 행을 지운다(locale-add design §1 전이 표 마지막 행). 전달 목록은 승인 뒤 전달을 가르려고 묶는다. */
  localeChanges: readonly LocaleChangeState[];
};

export function discardFingerprint(input: DiscardFingerprintInput): string {
  const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  // 배열 튜플로 직렬화한다 — 구분자 이어붙이기는 `id|token` 경계가 움직인 두 입력을 같은 문자열로 만든다.
  const canonical = JSON.stringify([
    input.userId,
    input.projectId,
    // 호스트·GitLab 연결 참조까지 — 같은 숫자 id의 다른 호스트, 다른 OWNER의 GitLab 재연결 뒤 옛 승인이 통하지 않는다(gitlab-repositories). 저장하지 않는 지문이라 바이트가 바뀌어도 된다.
    [input.repository.repoHost, input.repository.repositoryId, input.repository.installationId, input.repository.gitlabConnectionId, input.repository.repoOwner, input.repository.repoName, input.repository.baseBranch],
    [...input.surfaces].sort(byId).map(s => [s.id, s.importRevision, s.adapterName, s.pathTemplate, s.baseLocale, ...(s.basePath === null ? [] : [s.basePath])]),
    [...input.pending].sort(byId).map(p => [p.id, p.token]),
    canonicalLocaleChanges(input.localeChanges),
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

export type RemovalFingerprintInput = {
  userId: string;
  projectId: string;
  surfaceId: string;
  /**
   * ⚠️ **그 소스의 토큰 전부다 — orphaned 키·로케일 포함** (POSTMORTEM "세는 집합 ≠ 바꾸는 집합"). 되살림 첫 적재가 승인하는 집합이
   * `surfaceId` 전체라, 화면용 `pendingWhere`(활성만)로 세면 승인 안 받은 orphan 편집이 덮인다.
   */
  pending: readonly { id: string; token: string }[];
  /** 그 소스의 언어 변경 상태(0 또는 1개) — 제거가 의도 행·전달 목록을 지운다(locale-add design §5 "소스 제거·재등록"). */
  localeChanges: readonly LocaleChangeState[];
};

/**
 * 소스 제거 승인 지문 (sources-add-remove — ARCHITECTURE §5.9). 수동 Sync 지문과 같은 형(HMAC·만료 없음, 잠금 뒤 재계산)이고
 * 용도 접두 `"remove-surface"`가 둘을 가른다 — 같은 토큰 집합의 Sync 승인이 제거 승인으로 통과하지 않는다.
 */
export function removalFingerprint(input: RemovalFingerprintInput): string {
  const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const canonical = JSON.stringify(["remove-surface", input.userId, input.projectId, input.surfaceId, [...input.pending].sort(byId).map(p => [p.id, p.token]), canonicalLocaleChanges(input.localeChanges)]);
  return createHash("sha256").update(canonical).digest("hex");
}

export function sameFingerprint(approved: string | null, current: string): boolean {
  if (approved === null) return false;
  const a = Buffer.from(approved);
  const b = Buffer.from(current);
  // `timingSafeEqual`은 길이가 다르면 던진다 — 길이는 공개 정보(sha256 hex 고정)라 먼저 걸러도 새는 것이 없다.
  return a.length === b.length && timingSafeEqual(a, b);
}
