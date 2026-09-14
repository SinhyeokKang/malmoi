import { z } from "zod";

import type { AdapterError } from "@/lib/adapters/types";
import { m } from "@/lib/i18n";

/**
 * 임포트 결과의 **순수 계약** (projects-list design §3.35). I/O가 없으므로 Route Handler·Server
 * Action·CLI가 같은 판정을 쓴다.
 *
 * ⚠️ **잎이어야 한다** — 목록과 설정 화면이 이 문장을 읽고, 그 그래프가 곧 번들이다
 * (`components/__tests__/client-graph.test.ts`). `@/lib/adapters/types`는 **타입만** 가져온다:
 * 값으로 끌어오면 `ADAPTER_ERROR_CODES`를 따라 그 디렉터리가 통째로 열린다
 * (`lib/i18n/adapter-errors.ts`가 같은 이유로 같은 제약을 진다).
 */

/**
 * **CI가 보고할 수 있는 넷.** 외부 계약이라 서버만 쓰는 코드와 갈라 둔다 — `partial-import`는
 * "데이터가 들어갔는데 일부가 빠졌다"는 뜻이고 그 판정은 적재를 실제로 돌린 쪽만 할 수 있다.
 * 보고로 받으면 아무것도 안 들어간 프로젝트가 부분 성공으로 보인다.
 */
export const REPORTED_IMPORT_FAILURES = [
  "parse-failed",
  "parse-crashed",
  "invalid-locale-data",
  "prepare-failed",
] as const;

export type ReportedImportFailure = (typeof REPORTED_IMPORT_FAILURES)[number];

/** 서버 적재만 기록하는 둘. */
const SERVER_IMPORT_FAILURES = ["partial-import", "import-failed"] as const;

/** `Project.lastImportError`에 들어갈 수 있는 값 전부. */
export const IMPORT_FAILURE_CODES = [...REPORTED_IMPORT_FAILURES, ...SERVER_IMPORT_FAILURES] as const;

export type ImportFailureCode = (typeof IMPORT_FAILURE_CODES)[number];

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
 * ⚠️ **배열 `includes`다 — 객체 조회가 아니다.** DB 컬럼에서 읽은 남의 문자열이라
 * `constructor`·`__proto__`가 값으로 찾아지는 부류이고, 이 리포는 그것을 두 번 밟았다
 * (POSTMORTEM 2026-09-08·09).
 */
export function isImportFailureCode(raw: string | null | undefined): raw is ImportFailureCode {
  return IMPORT_FAILURE_CODES.some((c) => c === raw);
}

/**
 * 갈래 누락을 **컴파일 타임에** 잡는다 — 사전이 잎이라 union을 그쪽에서 import할 수 없으므로
 * 소비자가 `satisfies`를 건다 (`adapterErrorMessage`와 같은 관용구).
 */
const FAILURE_SENTENCE = {
  "parse-failed": m.projects.importFailure.parseFailed,
  "parse-crashed": m.projects.importFailure.parseCrashed,
  "invalid-locale-data": m.projects.importFailure.invalidLocaleData,
  "prepare-failed": m.projects.importFailure.prepareFailed,
  "partial-import": m.projects.importFailure.partialImport,
  "import-failed": m.projects.importFailure.importFailed,
} satisfies Record<ImportFailureCode, string>;

/**
 * 코드 → 화면 문장. **파서 원문은 애초에 저장되지 않으므로 여기서 뺄 것이 없다.**
 *
 * ⚠️ **`FAILURE_SENTENCE[code]`를 그대로 쓰지 않는다** — 이 값은 DB 컬럼에서 오고, 프로토타입 키가
 * 코드 자리에 오면 `Object.prototype`에서 **함수**가 찾아져 문자열 자리에 들어간다
 * (POSTMORTEM 2026-09-08 🔴1).
 */
export function importFailureMessage(code: ImportFailureCode): string {
  const sentence = Object.hasOwn(FAILURE_SENTENCE, code) ? FAILURE_SENTENCE[code] : undefined;
  return typeof sentence === "string" ? sentence : m.projects.importFailure.importFailed;
}

/**
 * `applyPush`의 트랜잭션에 실을 임포트 결과.
 *
 * ⚠️ **적재와 같은 트랜잭션이어야 한다.** 뒤에 따로 쓰면 데이터는 들어갔는데 목록만 실패로 남는 창이
 * 생기고, 그 창에서 사용자가 보는 것은 "적재가 깨졌다"인데 실제로는 끝난 상태다.
 * 호출부가 시작 시각을 대조한 실행만 비운다 — 나중 실행이 돌고 있다면 그 표시를 보존한다.
 */
export function importOutcomeFields(code: ImportFailureCode | null): {
  lastImportError: ImportFailureCode | null;
  lastImportStartedAt: null;
} {
  return { lastImportError: code, lastImportStartedAt: null };
}
