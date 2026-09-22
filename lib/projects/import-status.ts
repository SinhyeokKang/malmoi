import { z } from "zod";

import type { AdapterError } from "@/lib/adapters/types";
import { REPORTED_IMPORT_FAILURES, type ReportedImportFailure, type ImportFailureCode } from "./import-failure";
export { REPORTED_IMPORT_FAILURES, IMPORT_FAILURE_CODES, isImportFailureCode, importFailureMessage } from "./import-failure";
export type { ReportedImportFailure, ImportFailureCode } from "./import-failure";

/**
 * 임포트 결과의 **순수 계약** (PRODUCT §7.8). I/O가 없으므로 Route Handler·Server
 * Action·CLI가 같은 판정을 쓴다.
 *
 * ⚠️ **잎이어야 한다** — 목록과 설정 화면이 이 문장을 읽고, 그 그래프가 곧 번들이다
 * (`components/__tests__/client-graph.test.ts`). `@/lib/adapters/types`는 **타입만** 가져온다:
 * 값으로 끌어오면 `ADAPTER_ERROR_CODES`를 따라 그 디렉터리가 통째로 열린다
 * (`lib/i18n/adapter-errors.ts`가 같은 이유로 같은 제약을 진다).
 */

/**
 * 실패 보고의 본문. **닫혀 있다**(`strictObject`) — 모르는 필드를 무시하면 보고자가 조용히 다른 것을
 * 보내기 시작하고, 그 다른 것이 파서 원문이면 DB와 화면에 남는다.
 *
 * ⚠️ **제약이 `PushPayload`와 같은 문장이다** (`lib/push/plan.ts`) — 같은 CI가 같은 값을 만들고,
 * 둘이 갈리면 정상 push는 통과하는 커밋이 실패 보고에서만 거부된다.
 *
 * ⚠️ **`commitSha`는 받되 저장하지 않는다.** 기준 커밋을 전진시키면 다음 정상 push가 자기 커밋으로
 * `stale-commit` 409를 받는다 — 실패 보고는 아무것도 적재하지 않았다.
 */
export const ImportFailureReport = z.strictObject({
  projectSlug: z.string().min(1),
  surfaceSlug: z.string().min(1).max(40),
  commitSha: z.string().regex(/^[0-9a-f]{40}$/, "commitSha must be 40 lowercase hex characters"),
  commitAt: z.iso.datetime({ offset: true }),
  code: z.enum(REPORTED_IMPORT_FAILURES),
  /**
   * 정상 push와 **같은 실행 식별자**다 (logs-rework design §3.3) — 한 실행이 성공 보고와 실패 보고를
   * 동시에 내지 않으므로, 같은 토큰이 둘 중 하나를 한 건으로 만든다.
   *
   * ⚠️ **`strictObject`라 구 서버는 이 필드를 거부한다** — 그래서 전환 순서가 "서버 먼저, 생산자
   * 나중"이다. 새 생산자를 구 서버에 먼저 연결하면 실패 보고가 통째로 400이 된다.
   */
  executionId: z.uuid().optional(),
});

export type ImportFailureReportType = z.infer<typeof ImportFailureReport>;

/**
 * 섞인 read 오류에서 **대표 코드 하나**를 고른다. 표시가 문장 하나이므로 판정도 하나여야 한다.
 *
 * ⚠️ **파서 분류를 다시 짜지 않는다** — `parse-failed`·`parse-crashed`는 어댑터가 이미 가른 축이고
 * (`ADAPTER_ERROR_CODES`의 선언 순서가 그것이다), 여기서 새로 판정하면 두 벌이 되어 하나가 낡는다.
 * 나머지 read 오류는 전부 "엔트리를 못 읽었다"라 한 갈래로 접는다 — 화면이 코드마다 다른 문장을
 * 들 이유가 없고, 어느 엔트리였는지는 CI 로그에 남아 있다.
 *
 * read 오류가 없는데 실패했다면 탐지·조립 단계다.
 */
export function representativeFailureCode(errors: readonly AdapterError[]): ReportedImportFailure {
  if (errors.some((e) => e.code === "parse-failed")) return "parse-failed";
  if (errors.some((e) => e.code === "parse-crashed")) return "parse-crashed";
  return errors.length === 0 ? "prepare-failed" : "invalid-locale-data";
}

/**
 * `applyPush`의 트랜잭션에 실을 임포트 결과.
 *
 * ⚠️ **적재와 같은 트랜잭션이어야 한다.** 뒤에 따로 쓰면 데이터는 들어갔는데 목록만 실패로 남는 창이
 * 생기고, 그 창에서 사용자가 보는 것은 "적재가 깨졌다"인데 실제로는 끝난 상태다.
 * 호출부가 실행 토큰을 대조한 실행만 비운다 — 나중 실행이 돌고 있다면 그 표시를 보존한다.
 */
/**
 * @param at 이 결과를 쓰는 시각. **함수가 시계를 읽지 않는다** — 순수해야 하고, 같은 트랜잭션의
 *   다른 쓰기와 시각이 갈리면 안 된다.
 *
 * ⚠️ **성공이 `lastImportFailedAt`도 비운다** (ARCHITECTURE §5). 안 비우면 성공한 뒤에도
 * Home의 항목·배너·메타 행이 옛 실패를 말한다 — `lastImportError`만 비우면 시각이 유령으로 남는다.
 */
export function importOutcomeFields(code: ImportFailureCode | null, at: Date): {
  lastImportError: ImportFailureCode | null;
  lastImportStartedAt: null;
  lastImportFailedAt: Date | null;
  lastImportedAt?: Date;
} {
  return {
    lastImportError: code,
    lastImportStartedAt: null,
    lastImportFailedAt: code === null ? null : at,
    // ⚠️ **실패는 이 값을 건드리지 않는다** — 마지막 성공은 실패한 뒤에도 유효한 사실이고(시안 `1d` ④가
    // 그 두 줄을 함께 세운다), 비우면 "지금 보이는 키가 언제 것인가"에 답할 값이 사라진다.
    ...(code === null ? { lastImportedAt: at } : {}),
  };
}
