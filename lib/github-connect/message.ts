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

export function connectErrorMessage(error: ConnectError): string {
  switch (error) {
    case "state-mismatch":
      return "연결 요청을 확인하지 못했어요. 설정 화면에서 다시 눌러 주세요.";
    case "state-expired":
      return "연결 요청이 만료됐어요. 설정 화면에서 다시 눌러 주세요.";
    case "wrong-user":
      return "연결을 시작한 계정과 지금 로그인한 계정이 달라요. 다시 눌러 주세요.";
    case "denied":
      return "GitHub에서 연결을 취소했어요. 계속하려면 다시 눌러 주세요.";
    case "exchange-failed":
      return "GitHub과 연결을 마치지 못했어요. 다시 눌러 주세요.";
    case "taken-by-other":
      // 무엇을 하면 되는지 말한다 — 막힌 이유만 알려주면 사용자가 갇힌다. 해제는 그 계정의
      // 주인만 할 수 있다 (design §3.4).
      return "그 GitHub 계정은 이미 다른 사용자가 연결했어요. 그분이 연결을 해제하면 쓸 수 있어요.";
    case "not-connected":
      return "먼저 GitHub 계정을 연결해 주세요. 아래 'GitHub 연결'을 누르면 돼요.";
    case "reauthorize":
      return "GitHub 인가가 풀렸어요. 'GitHub 다시 연결'을 눌러 주세요.";
    case "repo-not-installed":
      return "이 리포에 App이 설치돼 있지 않아요. 설치 링크로 설치한 뒤 다시 연결해 주세요.";
    case "installation-forbidden":
      return "그 설치에 접근할 수 있는 계정이 아니에요. 리포 소유자에게 권한을 요청해 주세요.";
    case "repo-forbidden":
      return "그 리포에 접근할 수 있는 계정이 아니에요. 리포 소유자에게 권한을 요청해 주세요.";
    case "unavailable":
      // 원인이 고정된 거부에 "잠시 뒤 다시"를 보이면 사용자가 같은 버튼을 반복해서 누른다 —
      // 그래서 이 문구는 여기 하나뿐이다 (2026-09-05 preview 실측의 `OAuthAccountNotLinked`).
      return "일시적인 오류가 났어요. 잠시 뒤 다시 시도해 주세요.";
    default:
      // 사유를 추가하면 여기서 컴파일 에러가 난다. 실행 시점의 모르는 값은 접는다(위 ⚠️).
      error satisfies never;
      return "GitHub 연결에 실패했어요. 설정 화면에서 다시 시도해 주세요.";
  }
}
