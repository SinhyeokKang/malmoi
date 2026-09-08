import { connectErrorMessage } from "@/lib/github-connect/message";
import { m } from "@/lib/i18n";

import { PROJECT_LIMIT } from "./create-plan";
import { PROJECT_SLUG_MAX } from "./slug";

/**
 * 온보딩 실패 갈래 → 사용자 문구 (design §3.12). `connectErrorMessage`와 **같은 형**이다: 문구는
 * 사전(`messages/en.tsx`)이 들고 갈래 누락은 `satisfies Record<Union, string>`이 컴파일 타임에 막으며,
 * 모르는 값에는 **던지지 않고 폴백**한다 — `?e=`는 주소창에 있어 사용자가 손댈 수 있다.
 *
 * ⚠️ **이 모듈은 클라이언트 컴포넌트가 import한다** (`translation-input`·`pull-button`·온보딩 화면).
 * 그래서 여기서 **값**으로 끌어오는 것이 곧 클라이언트 번들이다. 2026-09-07에 실제로 새어 나갔다:
 * `./slug`가 `lib/pull/trigger`를 import했고 그 그래프가 `lib/adapters` → `ts-dict` → **ts-morph
 * (TypeScript 컴파일러 전체)** 로 이어져 **7.2MB 청크**가 세 페이지에 붙었다. 트리 셰이킹은 그것을
 * 떼어내지 못했다 — 당시 확인이 `@octokit`만 grep한 것이어서 "떼어냈다"고 잘못 읽었다.
 * 판정은 잎 모듈 `lib/pull/ref-slug.ts`로 내려갔고, **경계는 `components/__tests__/client-graph.test.ts`가
 * 상시로 센다** (grep 한 번이 아니다).
 *
 * ⚠️ **판정 union을 만드는 커밋과 문구를 만드는 커밋을 나누지 않는다.** "거부는 옳게 판정됐는데 화면에
 * 닿지 않아 버튼이 안 눌린 것으로 보였다"가 이 리포에서 두 번 밟은 지뢰다 (POSTMORTEM 2026-09-06).
 * `/projects/new`는 이 판정과 `isConnectError`를 **둘 다** 읽는다 (callback이 `ConnectError`를 실어 보낸다).
 */

export type OnboardError =
  // ── ①' 연결·설치 ──────────────────────────────────────────────────────────
  /** App을 설치한 GitHub 계정이 없다. 화면이 설치 링크를 옆에 둔다 (`GITHUB_APP_SLUG` 없으면 대체 문구). */
  | "no-installations"
  /** 설치는 있는데 선택된 리포가 없다 (`Only select repositories`). */
  | "no-repos"
  // ── ③ 탐지 ────────────────────────────────────────────────────────────────
  /** 후보 0개 — 수동 지정이 유일한 길이라 화면이 그것을 펼친다. */
  | "no-candidates"
  /**
   * GitHub 트리 응답이 잘렸다 — **수동 지정도 막힌다.** 확정의 재검증이 같은 스냅샷을 읽어 같은
   * 갈래를 다시 내기 때문이다 (2026-09-07 정정 — 전 주석은 "수동 지정은 된다"고 적어 있었다).
   */
  | "tree-truncated"
  /** `probeRepo` 200 뒤의 base 브랜치 404 — 권한 없음과 갈라 있다 (design §3.10). */
  | "base-branch-missing"
  /** 후보 단위 — 탈락이 아니다. 표시 라벨이라 `?e=`로는 오지 않는다. */
  | "key-count-failed"
  /** 수동 지정 템플릿이 아무 파일도 가리키지 않거나 재검증에 실패했다. */
  | "manual-no-match"
  // ── ④ 생성 — planRepoConnect 그대로 ──────────────────────────────────────
  | "installation-forbidden"
  | "repo-forbidden"
  | "repo-not-installed"
  // ── ④ 생성 — 이쪽 고유 ───────────────────────────────────────────────────
  | "slug-taken"
  | "limit-reached"
  | "invalid-slug"
  // ── 다시 시도 · 첫 적재 ──────────────────────────────────────────────────
  /** `ready`에서 다시 적재하려 했다 — strict push라 번역자 편집을 덮으므로 막는다 (design §3.7). */
  | "not-awaiting"
  | "ingest-failed"
  /**
   * 첫 적재가 끝나기 전에 번역 Action이 불렸다 (design §3.7). 화면으로는 도달하지 않고 **URL 직접
   * 호출**과 적재 실패 후의 재방문이 여기로 온다 — 그래도 문구를 두는 이유는 번역자가 저장 실패
   * 한 줄로 그것을 만나기 때문이다 (POSTMORTEM 2026-09-06).
   */
  | "not-ready"
  // ── 전부 ─────────────────────────────────────────────────────────────────
  /** 조회·네트워크 실패. **거부가 아니다** — 유일하게 재시도가 맞는 사유다. */
  | "unavailable"
  /** 세션 만료. 중간 상태 무저장(design §3.4)이라 "입력한 값은 그대로"라고 말하면 거짓이다. */
  | "unauthorized";

const ONBOARD_ERRORS: ReadonlySet<string> = new Set<OnboardError>([
  "no-installations",
  "no-repos",
  "no-candidates",
  "tree-truncated",
  "base-branch-missing",
  "key-count-failed",
  "manual-no-match",
  "installation-forbidden",
  "repo-forbidden",
  "repo-not-installed",
  "slug-taken",
  "limit-reached",
  "invalid-slug",
  "not-awaiting",
  "ingest-failed",
  "not-ready",
  "unavailable",
  "unauthorized",
]);

export function isOnboardError(value: unknown): value is OnboardError {
  return typeof value === "string" && ONBOARD_ERRORS.has(value);
}

/**
 * ⚠️ **넷은 사전에 없다** — `installation-forbidden`·`repo-forbidden`·`repo-not-installed`·`unavailable`은
 * 연결 화면과 같은 거부라 `connectErrorMessage`가 그대로 낸다. 같은 거부에 문구가 두 벌이면 안 된다.
 *
 * ⚠️ **둘은 함수 값이다** — 상수를 보간해야 하는데 사전은 잎이라 `PROJECT_LIMIT`·`PROJECT_SLUG_MAX`를
 * import할 수 없다. 그래서 값은 여기서 넘긴다.
 */
type SharedWithConnect = "installation-forbidden" | "repo-forbidden" | "repo-not-installed" | "unavailable";
type Interpolated = "limit-reached" | "invalid-slug";

const ONBOARD = m.errors.onboarding satisfies Record<
  Exclude<OnboardError, SharedWithConnect | Interpolated> | "fallback",
  string
> &
  Record<Interpolated, (value: number) => string>;

export function onboardErrorMessage(error: OnboardError): string {
  switch (error) {
    case "installation-forbidden":
    case "repo-forbidden":
    case "repo-not-installed":
    case "unavailable":
      return connectErrorMessage(error);
    case "limit-reached":
      return ONBOARD["limit-reached"](PROJECT_LIMIT);
    case "invalid-slug":
      return ONBOARD["invalid-slug"](PROJECT_SLUG_MAX);
    default:
      // 모르는 값은 접는다 — `?e=`는 주소창에 있다.
      return ONBOARD[error] ?? ONBOARD.fallback;
  }
}

/**
 * 첫 적재 결과의 헤드라인 — 불변식 9: **0건이 아니면 성공 문구를 그대로 쓰지 않는다.**
 * `pullMessage`의 "다만 N건은 반영되지 못했어요" 형이다.
 *
 * @param failed `read.errors.length + duplicateKeys`
 */
export function ingestHeadline(count: number, failed: number): string {
  return m.newProject.imported(count, failed);
}
