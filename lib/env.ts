import { MissingEnvError } from "./failure";

// 환경변수 단일 접근점. 흩어진 process.env 접근은 누락된 변수를 런타임까지 숨기므로
// 여기서만 읽는다(CLAUDE.md 코드 컨벤션). 새 변수를 추가하면 .env.example도 같은 커밋에서 갱신한다.

/** 필수 환경변수. 없으면 즉시 던진다 — 조용한 폴백이 설정 누락을 프로덕션까지 데려간다. */
/** 테스트에서 주입할 수 있도록 맵을 받는다. NodeJS.ProcessEnv를 쓰면 Next 타입이
 *  NODE_ENV를 필수로 만들어 테스트가 리터럴을 못 넘긴다. */
type EnvSource = Record<string, string | undefined>;

export function requireEnv(name: string, source: EnvSource = process.env): string {
  const value = source[name];
  if (value === undefined || value === "") {
    // 전용 타입이다 — 라우트가 이 오류만 500 본문에 그대로 싣는다 (`lib/failure.ts`).
    throw new MissingEnvError(`missing environment variable ${name}. See .env.example.`);
  }
  return value;
}

/**
 * 선택 환경변수. 없거나 빈 문자열이면 `undefined` — **던지지 않는다.**
 *
 * `requireEnv`와 갈라 둔 이유: 인가 판정(`checkBearer` 등)은 누락을 스스로
 * fail-closed로 처리해야 응답이 "미설정 500 / 거부 401"로 갈린다. 여기서 던지면 그 판정에
 * 닿기 전에 본문 없는 500이 된다. 값을 쓰는 쪽이 `process.env`를 직접 읽지 않게 하는 것이
 * 이 함수의 유일한 역할이다 (CLAUDE.md "환경변수는 한 곳에서 읽는다").
 */
export function optionalEnv(name: string, source: EnvSource = process.env): string | undefined {
  const value = source[name];
  return value === undefined || value === "" ? undefined : value;
}

/**
 * GitHub App 개인키 복원. Vercel env에 PEM을 넣으면 개행이 `\n` 두 문자로 이스케이프되고,
 * 그대로 서명에 쓰면 JWT가 **조용히** 실패한다(에러 메시지가 원인을 안 가리킨다).
 */
export function parsePrivateKey(raw: string): string {
  return raw.includes("\\n") ? raw.replaceAll("\\n", "\n") : raw;
}
