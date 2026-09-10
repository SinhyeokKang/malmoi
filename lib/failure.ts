// 500 본문에 무엇을 실을지의 판정. I/O가 없는 순수 함수라 두 라우트가 같은 규칙을 쓴다.

import type { SyncErrorCode } from "@/lib/sync/plan";

/**
 * **우리가 문구를 정한 오류.** 500 본문에 그대로 실린다.
 *
 * 담아도 되는 것: slug·경로 템플릿·어댑터 이름·로케일·설정 컬럼 이름 — 전부 CI가 이미 입력으로
 * 아는 값이다. ⚠️ **담으면 안 되는 것**: 라이브러리 메시지. `fail(String(err))`로 감싸 넘기는
 * 순간 이 방어가 무의미해진다 — 그건 판정이 막을 수 없는 규율의 문제다.
 *
 * **이름으로 판정한다** — `instanceof`는 모듈 인스턴스가 둘이 되면(번들 경계·테스트 mock) 조용히
 * false가 되고, 그러면 설정 누락이 `internal`로 접혀 회고가 요구한 "원인이 남는 500"을 잃는다.
 */
export class AppError extends Error {
  /**
   * `SyncRun.errorCode`에 남을 안정적 이름 (`docs/features/sync-runs/design.md` §1.3).
   *
   * ⚠️ **선택이다** — 코드가 붙는 자리는 sync가 가려야 하는 실패뿐이고, 불변식 위반(`unreachable:`)이나
   * readiness가 이미 막는 설정 부재에는 붙지 않는다("생산자 없는 코드는 두지 않는다").
   * ⚠️ **`classifyFailure`는 이 필드를 안 본다** — 그 함수는 "본문에 실어도 되는가"를, 코드는
   * "무엇이 실패했나"를 답한다. 축이 다르므로 판정도 따로다(`classifySyncError`).
   */
  readonly code?: SyncErrorCode;

  constructor(message: string, code?: SyncErrorCode) {
    super(message);
    this.name = "AppError";
    this.code = code;
  }
}

/**
 * `AppError`를 던진다. 반환형이 `never`라 `throw`와 같게 타입이 좁혀진다.
 *
 * `throw new AppError(...)`보다 이걸 쓰는 이유는 호출부가 `if (!x) fail(...)` 한 줄로 끝나서다 —
 * 18곳을 바꾸면서 줄이 늘지 않는다.
 *
 * @param code 있으면 `SyncRun.errorCode`가 된다. **잡는 쪽이 메시지를 매칭하지 않게 하려는 것**이라
 *   문구를 고쳐도 분류가 안 흔들린다.
 */
export function fail(message: string, code?: SyncErrorCode): never {
  throw new AppError(message, code);
}

/** `requireEnv`가 던지는 오류. `AppError`와 같은 이유로 안전하다 — 변수 **이름**만 담는다. */
export class MissingEnvError extends AppError {
  constructor(message: string) {
    super(message);
    this.name = "MissingEnvError";
  }
}

/** 본문에 실어도 되는 오류의 이름. 우리가 만든 클래스만 들어온다. */
const SAFE_ERROR_NAMES: ReadonlySet<string> = new Set([AppError.name, MissingEnvError.name]);

export type Failure =
  /** 우리가 만든 메시지다 — 본문에 그대로 실어도 된다. */
  | { safe: true; message: string }
  /** 남의 라이브러리가 만든 메시지다 — 본문엔 `ref`만, 전문은 서버 로그로. */
  | { safe: false; detail: string };

/**
 * 500 본문에 실을 수 있는 오류인가.
 *
 * ⚠️ **문구가 아니라 타입으로 가른다.** 남의 오류가 우연히 우리 문구를 담아도 안전이 아니고,
 * 반대로 우리 문구가 바뀌어도 판정이 흔들리지 않는다.
 *
 * 왜 필요한가: POSTMORTEM 2026-09-03이 "본문 없는 500"을 결함으로 박아 두 라우트가 던진 메시지를
 * 그대로 실었다. 그 전제("로그를 읽는 사람이 우리뿐")가 틀렸다 — `.github/actions/l10n-push`는
 * **임의의 대상 리포**에서 돌고 `scripts/push-local.ts`가 응답 본문을 stdout에 찍는다. 대상이
 * public이면 Prisma 접속 오류 한 번이 pooler 호스트와 DB 유저를 공개 Actions 로그에 박는다.
 */
export function classifyFailure(error: unknown): Failure {
  if (error instanceof Error) {
    if (SAFE_ERROR_NAMES.has(error.name)) return { safe: true, message: error.message };
    return { safe: false, detail: `${error.name}: ${error.message}` };
  }
  return { safe: false, detail: String(error) };
}
