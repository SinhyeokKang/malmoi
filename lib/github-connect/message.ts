import { m } from "@/lib/i18n";

/**
 * 연결 실패 사유 → 사용자 문구 (design §3.5). `inviteErrorMessage`(`lib/auth/message.ts`)와 **같은 형**이다:
 * `satisfies never`로 갈래 누락을 컴파일 타임에 막고, 모르는 값에는 **던지지 않고 폴백**한다.
 *
 * ⚠️ **던지지 않는 것이 이 형을 고른 이유다.** `?e=`는 주소창에 있어 사용자가 손댈 수 있다 — 던지면
 * 설정 화면이 통째로 죽는다. `accessErrorMessage`가 던져도 되는 것과 다르다(그쪽 인자는 우리 코드가
 * 만든 값만 들어온다).
 *
 * ⚠️ **판정 union을 만드는 커밋과 문구를 만드는 커밋을 나누지 않는다.** 이 리포에서 두 번 밟은 지뢰가
 * "거부는 옳게 판정됐는데 화면에 닿지 않아 사용자에겐 버튼이 안 눌린 것으로 보였다"이다
 * (POSTMORTEM 2026-09-06).
 */

export type ConnectError =
  // ── callback 쪽 (GitHub이 브라우저를 되돌린 뒤) ──────────────────────────
  /** 쿠키가 없거나 서명·nonce가 안 맞는다. 위조·중복 탭·배포 사이의 옛 쿠키가 전부 여기다. */
  | "state-mismatch"
  /** 서명은 맞는데 10분이 지났다. */
  | "state-expired"
  /** 연결을 시작한 계정과 지금 로그인한 계정이 다르다 — 같은 브라우저에서 계정을 갈아탔다. */
  | "wrong-user"
  /** 사용자가 GitHub 인가 화면에서 취소했다 (`?error=access_denied`). */
  | "denied"
  /** code 교환이 실패했다 — 재사용·만료된 code(GitHub은 이것도 HTTP 200 body로 준다). */
  | "exchange-failed"
  /** 그 GitHub 계정을 이미 다른 User가 연결했다 (SAAS §5.5 — 병합하지 않는다). */
  | "taken-by-other"
  // ── Server Action 쪽 ────────────────────────────────────────────────────
  /** 아직 GitHub 계정을 연결하지 않았다. */
  | "not-connected"
  /** 토큰이 만료됐고 갱신할 수단이 없다 — 다시 인가해야 한다. */
  | "reauthorize"
  /** 그 리포에 우리 App이 설치돼 있지 않다. */
  | "repo-not-installed"
  /** 그 설치가 로그인 사용자의 설치 목록에 없다 (SAAS §5.4 둘째 조건). */
  | "installation-forbidden"
  /** 설치는 보이는데 그 안에서 이 리포를 볼 수 없다 (셋째 조건). */
  | "repo-forbidden"
  // ── 양쪽 공통 ───────────────────────────────────────────────────────────
  /** 조회·네트워크 실패. **거부가 아니다** — 유일하게 재시도가 맞는 사유다. */
  | "unavailable";

const CONNECT_ERRORS: ReadonlySet<string> = new Set<ConnectError>([
  "state-mismatch",
  "state-expired",
  "wrong-user",
  "denied",
  "exchange-failed",
  "taken-by-other",
  "not-connected",
  "reauthorize",
  "repo-not-installed",
  "installation-forbidden",
  "repo-forbidden",
  "unavailable",
]);

/**
 * 착지 화면이 `?e=`를 걸러낼 때의 판정. **두 화면이 이것을 쓴다** — state가 유효하면
 * `/projects/<slug>/settings`, 믿을 수 없으면 `/projects`다. `/projects`는 `isAccessError`를 먼저 보므로
 * 겹치는 `unavailable`은 그쪽 문구로 나가고, 나머지 열한 사유는 이 판정이 없으면 **무음**이다.
 */
export function isConnectError(value: unknown): value is ConnectError {
  return typeof value === "string" && CONNECT_ERRORS.has(value);
}

const CONNECT = m.errors.connect satisfies Record<ConnectError | "fallback", string>;

export function connectErrorMessage(error: ConnectError): string {
  // 모르는 값은 접는다 — `?e=`는 주소창에 있어 사용자가 손댈 수 있고, 던지면 설정 화면이 통째로 죽는다.
  return CONNECT[error] ?? CONNECT.fallback;
}
