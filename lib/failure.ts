// 500 본문에 무엇을 실을지의 판정. I/O가 없는 순수 함수라 두 라우트가 같은 규칙을 쓴다.

/**
 * `requireEnv`가 던지는 오류. **이름으로 판정한다** — `instanceof`는 모듈 인스턴스가 둘이 되면
 * (번들 경계·테스트 mock) 조용히 false가 되고, 그러면 설정 누락이 `internal`로 접혀 회고가
 * 요구한 "원인이 남는 500"을 잃는다.
 */
export class MissingEnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingEnvError";
  }
}

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
    if (error.name === MissingEnvError.name) return { safe: true, message: error.message };
    return { safe: false, detail: `${error.name}: ${error.message}` };
  }
  return { safe: false, detail: String(error) };
}
