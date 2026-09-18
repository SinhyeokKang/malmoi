import { m } from "@/lib/i18n";

// 클라이언트에 실어도 되는 실패 낱말. 검증은 import-status.ts에 남는다.
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

