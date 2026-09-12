import { m } from "@/lib/i18n";

import { SYNC_ERROR_CODES, type SyncErrorCode } from "./plan";

/**
 * `logs` 화면의 순수 판정 (ARCHITECTURE §5.6).
 *
 * ⚠️ **`@/generated/prisma/client`를 값으로 import하지 않는다** — 이 모듈이 클라이언트 그래프에
 * 닿으면 그 순간 Prisma가 번들에 들어온다 (`components/__tests__/client-graph.test.ts`).
 * 상태·트리거를 **문자열 union으로 다시 적는** 이유가 그것이고, 스키마와 어긋나면 `loadSyncRuns`의
 * 반환 타입이 컴파일에서 걸린다.
 */

/** ⚠️ **`Badge` variant와 같은 이름이다** (DESIGN §6.2) — 화면이 매핑 표를 또 들지 않는다. */
export type SyncTone = "muted" | "warning" | "danger";

export type SyncRunRow = {
  id: string;
  status: "RUNNING" | "SUCCEEDED" | "SKIPPED" | "FAILED";
  trigger: "MANUAL" | "CRON";
  errorCode: string | null;
  /**
   * FK 조인 결과. **`null`은 "삭제된 사용자"다** — `onDelete: SetNull`이라 이력은 남고 저자만 빈다.
   *
   * ⚠️ **원문 이메일이 아니라 마스킹 라벨이다** (sec-audit 발견 4) — 이 값이 RSC 페이로드에 실리고
   * 관측자는 그 프로젝트의 EDITOR 이상이다. 안 읽는 것이 아니라 **안 돌려주는** 것이다.
   */
  requester: { name: string | null; emailLabel: string | null } | null;
  startedAt: Date;
  finishedAt: Date | null;
  changed: number | null;
  warnings: number;
  prUrl: string | null;
};

export type SyncRunView = {
  tone: SyncTone;
  label: string;
  triggerLabel: string;
  /** 실패가 아니면 `null`. 모르는 코드는 `"fallback"`이다. */
  reasonKey: SyncErrorCode | "fallback" | null;
};

/**
 * 행 하나 → 화면이 읽는 넷.
 *
 * ⚠️ **배지 색이 셋뿐이라 라벨이 구별을 든다** (DESIGN §6.2는 새 raw 색을 금지한다). 성공·스킵·
 * 진행 중이 전부 `muted`이고 — 가장 흔한 상태가 가장 조용하다 — 실패만 `danger`다.
 */
export function syncRunView(row: SyncRunRow): SyncRunView {
  return {
    tone: row.status === "FAILED" ? "danger" : "muted",
    label: statusLabel(row.status),
    triggerLabel: triggerLabel(row),
    reasonKey: row.status === "FAILED" ? reasonKey(row.errorCode) : null,
  };
}

function statusLabel(status: SyncRunRow["status"]): string {
  switch (status) {
    case "SUCCEEDED":
      return m.logs.status.succeeded;
    // ⚠️ **"branch equals base"가 아니다.** 그 비교는 base 대비이고(POSTMORTEM 2026-09-09) 읽는
    // 사람은 번역 편집자라, git 어휘를 꺼내면 뜻도 안 통하고 뉘앙스까지 틀린다.
    case "SKIPPED":
      return m.logs.status.skipped;
    case "FAILED":
      return m.logs.status.failed;
    default:
      // ⚠️ 줄임표는 **진행 중에만** 쓴다 (DESIGN §10).
      return m.logs.status.running;
  }
}

function triggerLabel(row: SyncRunRow): string {
  // cron 행에는 사람이 없다 — `requestedBy`가 null이다. 그래도 트리거를 먼저 보는 것은,
  // 혹시 남은 값이 있어도 "야간 실행"이 답이기 때문이다.
  if (row.trigger === "CRON") return m.logs.trigger.cron;
  if (row.requester === null) return m.logs.trigger.removed;
  // 멤버 표와 같은 폴백이다 — Google 계정엔 핸들이 없다. 두 화면이 갈리면 같은 사람이 다르게 보인다.
  return row.requester.name ?? row.requester.emailLabel ?? m.logs.trigger.removed;
}

/**
 * 사유 문장. **소비자가 `satisfies`를 건다** — `messages/en.tsx`에서 union을 import하면 그 파일이
 * 잎이 아니게 되고 그 그래프가 곧 클라이언트 번들이다 (POSTMORTEM 2026-09-07의 7.2MB).
 * `lib/i18n/adapter-errors.ts`·`lib/auth/message.ts`와 같은 형이다.
 */
const REASONS = m.logs.reasons satisfies Record<SyncErrorCode | "fallback", string>;

export function syncReasonMessage(key: SyncErrorCode | "fallback"): string {
  return REASONS[key];
}

function reasonKey(errorCode: string | null): SyncErrorCode | "fallback" {
  if (errorCode !== null && (SYNC_ERROR_CODES as readonly string[]).includes(errorCode)) {
    return errorCode as SyncErrorCode;
  }
  // ⚠️ **모르는 코드를 던지지 않는다.** `errorCode`가 enum이 아닌 이유가 이것이다 — 코드가 늘 때마다
  // 마이그레이션을 요구하면 "던지는 자리가 코드를 든다"는 규칙이 배포에 묶인다. 읽는 쪽이 폴백을 든다.
  return "fallback";
}

/**
 * 키셋 페이지네이션의 커서. `startedAt` 하나로는 같은 밀리초의 두 행이 서로를 건너뛰므로 `id`가 붙는다.
 *
 * ⚠️ **주소창 값이다** — `decodeCursor`는 무엇을 받아도 던지지 않고 `null`을 낸다. 화면은 첫 페이지를
 * 그린다 (`pick`이 모르는 `?e=`에 폴백을 내는 것과 같은 축이다).
 */
export function encodeCursor(cursor: { startedAt: Date; id: string }): string {
  return toBase64Url(`${cursor.startedAt.toISOString()}|${cursor.id}`);
}

export function decodeCursor(raw: string): { startedAt: Date; id: string } | null {
  const decoded = fromBase64Url(raw);
  if (decoded === null) return null;
  // ⚠️ id에 `|`가 들어갈 수 있다고 보고 **첫 구분자에서만** 자른다 — cuid엔 없지만, 그 가정이
  // 깨지는 날 조용히 잘린 id로 조회하면 결과가 빈 페이지다.
  const at = decoded.indexOf("|");
  if (at === -1) return null;
  const startedAt = new Date(decoded.slice(0, at));
  const id = decoded.slice(at + 1);
  if (Number.isNaN(startedAt.getTime()) || id === "") return null;
  return { startedAt, id };
}

/** `+`·`/`·`=`가 URL에 실리면 인코딩이 한 겹 더 붙는다 — base64url로 낸다. */
function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string): string | null {
  if (value === "" || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const decoded = Buffer.from(value, "base64url").toString("utf8");
  return decoded === "" ? null : decoded;
}
