import { httpStatus } from "@/lib/failure";
import { classifyFailure } from "@/lib/failure";

import type { PullResult } from "@/lib/pull/run";

/**
 * sync 실행의 순수 판정 (ARCHITECTURE §5.6).
 *
 * **I/O가 0이다.** 껍데기(`lib/sync/run.ts`)가 이 판정을 트랜잭션·행 쓰기로 감쌀 뿐이고,
 * "돌려도 되는가"·"무엇으로 끝났는가"는 전부 여기서 결정된다. 그래서 동시 실행·stale 복구·
 * 오류 분류가 DB 없이 테스트된다.
 *
 * ⚠️ **`runPull`의 판정은 한 줄도 안 바꾼다.** 1층 스킵·2층 blob 비교·`captured`가 전부 그대로다 —
 * 새로 생기는 것은 그 **바깥**이다.
 */

/**
 * 수동 Publish의 최소 간격. **"리포에 쓴 뒤 쉬는 간격"이지 "시작 간격"이 아니다** — 그래서
 * 기준이 직전 실행의 `finishedAt`이고, 실패한 실행은 세지 않는다 (ARCHITECTURE §5.6.2).
 */
export const PUBLISH_MIN_INTERVAL_SECONDS = 30;

/**
 * 이보다 오래된 `RUNNING` 행은 죽은 프로세스가 남긴 것으로 본다.
 *
 * ⚠️ **`maxDuration`(60초)보다 넉넉해야 한다.** 같거나 작으면 **정상 실행이 스스로를 stale로 보고**
 * 두 번째 실행을 허용한다 (ARCHITECTURE §5.6.2). 그 전제가 수동 경로에서 서려면 번역 페이지가
 * `maxDuration = 60`을 선언해야 한다 — 없으면 프로젝트 기본값(300)이라 이 상수와 같아진다.
 */
export const STALE_AFTER_SECONDS = 300;

/**
 * 실행 표시가 아직 살아 있는가. **Publish와 수동 Sync(`lib/import/plan.ts`의 `hasActiveImport`)가 이 하나를 쓴다** —
 * 경계가 두 벌이면 한쪽은 막고 한쪽은 여는 창에서 둘이 동시에 돈다 (sync-edit-protection — ARCHITECTURE §5.6.1).
 * 경계 정각은 아직 진행 중이다 — 진행 중인 실행을 뺏지 않는다.
 *
 * ⚠️ 방향이 이쪽이다 — `lib/import/plan.ts`는 `@/lib/adapters`(ts-morph)를 물어 이 모듈이 그쪽을 import하면 안 된다.
 */
export function isRunActive(startedAt: Date, now: Date): boolean {
  return now.getTime() - startedAt.getTime() <= STALE_AFTER_SECONDS * 1000;
}

/** `logs` 화면의 한 페이지. 서버 `?cursor=` + "Older"가 이 수로 자른다. */
export const SYNC_LOG_PAGE_SIZE = 20;

// ⚠️ **다른 두 제한은 여기 없다** — 상수는 **소비자 옆**에 두고 모음 파일을 만들지 않는다:
// `PROJECT_LIMIT`은 `lib/onboarding/create-plan.ts`, `MEMBER_LIMIT`은 `lib/auth/invitation.ts`다.
// 위 셋이 여기 있는 이유는 소비자가 sync 경로 안에서 여럿(게이트·껍데기·화면)이어서다.

/**
 * `SyncRun.errorCode`에 남는 값. **생산자 없는 코드는 두지 않는다** — 여기 일곱은 전부
 * `lib/pull`의 특정 throw 자리이거나(`lib/pull/__tests__/error-codes.test.ts`가 양방향으로 고정한다)
 * 껍데기가 만드는 것(`stale`)이다.
 *
 * ⚠️ **없앤 것과 이유** (ARCHITECTURE §5.6.3): `adapter-write-failed`(어댑터 오류는 `warnings`로 접혀 실패가
 * 아니다) · `app-uninstalled`/`base-branch-missing`(같은 한 문장에서 나와 가를 수 없다 →
 * `base-unreadable` 하나) · `repo-unreachable`(status 판독 없이 못 만든다 → `github-error`).
 */
export const SYNC_ERROR_CODES = [
  "base-unreadable",
  "not-installed",
  "glob-matched-nothing",
  "github-error",
  "db-unavailable",
  "stale",
  "unknown",
] as const;

export type SyncErrorCode = (typeof SYNC_ERROR_CODES)[number];

/**
 * 다시 해도 되는가. **`false`는 "사람이 설정을 고쳐야 한다"**는 뜻이다 — 그 셋은 다음 밤 cron이
 * 자동으로 다시 밟아도 같은 실패를 낸다.
 */
const RETRYABLE: Readonly<Record<SyncErrorCode, boolean>> = {
  "base-unreadable": false,
  "not-installed": false,
  "glob-matched-nothing": false,
  "github-error": true,
  "db-unavailable": true,
  stale: true,
  unknown: true,
};

export type SyncTriggerKind = "manual" | "cron";

export type SyncStart =
  /** @param staleToClose 껍데기가 옛 `RUNNING` 행을 `FAILED`/`stale`로 닫아야 한다는 뜻이다. */
  | { status: "ok"; staleToClose: boolean }
  | { status: "already-running" }
  /** @param retryAfterSeconds 화면이 "N초 뒤에"를 말하는 데 쓴다 — 문구가 상수를 따로 들면 둘이 갈린다. */
  | { status: "too-soon"; retryAfterSeconds: number };

/**
 * 실행해도 되는가.
 *
 * - **`archived`는 여기 없다** — 인가가 먼저 거른다. 게이트는 인가를 지난 요청만 받는다.
 * - **`already-running`이 `too-soon`보다 앞이다.** 둘 다 걸릴 때 "30초 뒤에 다시"는 거짓이다 —
 *   30초를 기다려도 첫 실행이 안 끝났으면 또 거부된다.
 * - **`too-soon`은 `manual`에만 건다.** cron은 하루 1회라 최소 간격이 의미가 없고, 거기에 걸면
 *   **야간 실행이 조용히 안 도는** 경로가 생긴다.
 *
 * @param running `status = RUNNING`인 최신 행. 없으면 `null`.
 * @param lastSettled `status ∈ {SUCCEEDED, SKIPPED}`인 최신 행. **FAILED는 호출부가 `null`로 준다** —
 *   제한의 목적은 "리포에 두 번 쓰기" 방지이지 재시도 억제가 아니다 (ARCHITECTURE §5.6.2).
 */
export function planSyncStart(input: {
  now: Date;
  running: { startedAt: Date } | null;
  lastSettled: { finishedAt: Date } | null;
  trigger: SyncTriggerKind;
  /**
   * 진행 중인 수동 Sync(`Project.repositoryImportStartedAt`). Sync가 리포 값으로 덮는 중에 Publish가 스냅샷을 뜨면
   * 절반만 덮인 DB가 PR로 나간다 (sync-edit-protection — ARCHITECTURE §5.6.1).
   * 껍데기(`lib/sync/run.ts`)가 같은 Project 잠금 안에서 읽어 넘긴다.
   */
  activeImport: { startedAt: Date } | null;
}): SyncStart {
  const { now, running, lastSettled, trigger, activeImport } = input;

  const staleToClose = running !== null && !isRunActive(running.startedAt, now);
  if (running !== null && !staleToClose) return { status: "already-running" };
  if (activeImport !== null && isRunActive(activeImport.startedAt, now)) return { status: "already-running" };

  if (trigger === "manual" && lastSettled !== null) {
    const elapsed = (now.getTime() - lastSettled.finishedAt.getTime()) / 1000;
    if (elapsed < PUBLISH_MIN_INTERVAL_SECONDS) {
      // 올림이다 — 내림하면 "0초 뒤에 다시"를 안내하고 그 즉시 또 거부된다.
      const retryAfterSeconds = Math.ceil(PUBLISH_MIN_INTERVAL_SECONDS - elapsed);
      return { status: "too-soon", retryAfterSeconds };
    }
  }

  return { status: "ok", staleToClose };
}

export type SyncFinish = {
  status: "SUCCEEDED" | "SKIPPED" | "FAILED";
  errorCode: SyncErrorCode | null;
  retryable: boolean | null;
  /** committed에만 있다. */
  prUrl: string | null;
  /** **실패는 `null`이다** — 0은 "아무것도 안 바뀌었다"는 관측이고, 실패엔 관측 자체가 없다. */
  changed: number | null;
  warnings: number;
};

/**
 * 결과를 행으로.
 *
 * ⚠️ **`PullResult`에 `failed`가 없다** — `runPull`은 실패하면 던진다. 그래서 `{ thrown }`이 실패의
 * 유일한 입구이고, 지금 세 곳이 각자 만들던 `{status:"failed"}` 모양이 여기 하나로 모인다.
 *
 * ⚠️ **`skipped`를 `SUCCEEDED`로 접지 않는다.** `lastPublishedAt`이 `skipped`에서 안 움직이므로
 * ("마지막으로 **보낸**" 것이지 시도한 것이 아니다 — `lib/pull/load.ts`) 그 구별이 행에도 남아야
 * `logs`가 "어제 밤엔 보낼 게 없었다"와 "어제 밤에 보냈다"를 가른다.
 *
 * ⚠️ **`warnings`는 `skipped/writer-warnings`에서 센다** — 쓰기 전에 멈춘 실행이고(sync-edit-protection T10), 버린 값을
 * 조용히 숨기면 ARCHITECTURE §0 불변식 9 위반이다. 성공·동등 결과에는 경고 자리가 없다.
 */
export function planSyncFinish(result: PullResult | { thrown: unknown }): SyncFinish {
  if ("thrown" in result) {
    const { code, retryable } = classifySyncError(result.thrown);
    return { status: "FAILED", errorCode: code, retryable, prUrl: null, changed: null, warnings: 0 };
  }

  const warnings = result.status === "skipped" && result.reason === "writer-warnings" ? result.warnings.length : 0;
  if (result.status === "skipped") {
    return { status: "SKIPPED", errorCode: null, retryable: null, prUrl: null, changed: 0, warnings };
  }
  return {
    status: "SUCCEEDED",
    errorCode: null,
    retryable: null,
    prUrl: result.prUrl,
    changed: result.changed.length,
    warnings,
  };
}

/**
 * 안정적 오류 코드.
 *
 * ⚠️ **문자열 매칭이 아니다.** pull 실패는 전부 메시지만 다른 `AppError`라, 문구로 가르면 문장
 * 하나가 바뀔 때 분류가 조용히 무너진다 (POSTMORTEM 2026-09-08의 "오류 단언은 코드를 본다"와 같은 축).
 * 코드는 **던지는 자리**가 든다.
 *
 * `safeMessage`는 `classifyFailure`를 그대로 부른다 — 이 값이 대상 리포의 (public일 수 있는)
 * Actions 로그로 흘러가므로 안전 규칙이 두 벌이 되면 안 된다.
 */
export function classifySyncError(error: unknown): {
  code: SyncErrorCode;
  retryable: boolean;
  safeMessage: string | null;
} {
  const failure = classifyFailure(error);
  const code = errorCodeOf(error);
  return { code, retryable: RETRYABLE[code], safeMessage: failure.safe ? failure.message : null };
}

function errorCodeOf(error: unknown): SyncErrorCode {
  if (typeof error !== "object" || error === null) return "unknown";

  // ⚠️ **`code`를 든 오류가 우리 것만은 아니다** — Node는 `ECONNREFUSED`를, Prisma는 `P2025`를 같은
  // 이름에 싣는다. 그래서 **값이 union 안에 있는지**를 보고, 아니면 없는 것으로 친다.
  const tagged = (error as { code?: unknown }).code;
  if (typeof tagged === "string" && (SYNC_ERROR_CODES as readonly string[]).includes(tagged)) {
    return tagged as SyncErrorCode;
  }

  // 이름으로 가른다 — `instanceof`는 모듈 인스턴스가 둘이면 조용히 false가 된다(`classifyFailure`와 같은 이유).
  const name = (error as { name?: unknown }).name;
  if (typeof name === "string" && name.startsWith("PrismaClient")) return "db-unavailable";

  // octokit은 예외에 HTTP 상태를 싣는다. 추출 규칙을 두 벌로 만들지 않는다 (`lib/github-connect/health.ts`).
  if (httpStatus(error) !== undefined) return "github-error";

  return "unknown";
}
