import { connectErrorMessage } from "@/lib/github-connect/message";

import { PROJECT_LIMIT } from "./create-plan";
import { PROJECT_SLUG_MAX } from "./slug";

/**
 * 온보딩 실패 갈래 → 사용자 문구 (design §3.12). `connectErrorMessage`와 **같은 형**이다: `satisfies never`로
 * 갈래 누락을 컴파일 타임에 막고, 모르는 값에는 **던지지 않고 폴백**한다 — `?e=`는 주소창에 있어 사용자가
 * 손댈 수 있다.
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

export function onboardErrorMessage(error: OnboardError): string {
  switch (error) {
    case "no-installations":
      return "말모이 App을 설치한 GitHub 계정이 없어요. 먼저 App을 설치해 주세요.";
    case "no-repos":
      return "이 설치에 선택된 리포가 없어요. GitHub 설치 설정에서 리포를 추가해 주세요.";
    case "no-candidates":
      // 이유를 말한다 — 수동 지정으로 가는 근거다 (spec §5: 로케일이 하나뿐인 리포는 붙일 수 없다).
      return "로케일 파일을 찾지 못했어요. 언어가 2개 이상인 로케일 파일이 필요해요.";
    case "tree-truncated":
      // 수동 지정을 권하지 않는다 — 확정의 재검증이 같은 스냅샷을 읽어 같은 갈래를 다시 낸다.
      return "이 리포는 파일이 너무 많아 번역 파일을 찾을 수 없어요. 직접 지정해도 같은 이유로 막혀요.";
    case "base-branch-missing":
      return "기본 브랜치를 읽을 수 없어요. 리포에 커밋이 있는지 확인해 주세요.";
    case "key-count-failed":
      // ⚠️ **라벨이라 문장이 아니다** — 후보 줄의 "언어 3개 · 키 4개" 자리에 그대로 들어간다
      // (2026-09-07 리뷰 ⚪10: 화면이 자기 문구를 따로 들고 있었다).
      return "키 수 확인 실패";
    case "manual-no-match":
      return "그 경로에서 이 형식의 파일을 찾지 못했어요. 경로와 형식을 다시 확인해 주세요.";
    case "installation-forbidden":
    case "repo-forbidden":
    case "repo-not-installed":
    case "unavailable":
      // 같은 거부에 문구가 두 벌이면 안 된다 — 연결 화면과 같은 말을 한다.
      return connectErrorMessage(error);
    case "slug-taken":
      return "이미 쓰는 주소예요. 다른 주소를 골라 주세요.";
    case "limit-reached":
      return `프로젝트는 ${PROJECT_LIMIT}개까지 만들 수 있어요.`;
    case "invalid-slug":
      return `주소는 소문자·숫자·'-'·'.'·'_'만 쓸 수 있고 ${PROJECT_SLUG_MAX}자 이내여야 해요. 'new'는 쓸 수 없어요.`;
    case "not-awaiting":
      return "이미 적재가 끝났어요. 다시 적재하면 편집한 번역이 리포 값으로 덮이므로 여기서는 하지 않아요.";
    case "ingest-failed":
      return "첫 적재에 실패했어요. 설정 화면에서 다시 시도할 수 있어요.";
    case "not-ready":
      // 번역자가 읽는다 — 무엇을 기다리는지와 누가 끝낼 수 있는지를 말한다.
      return "아직 준비 중인 프로젝트예요. 소유자가 설정을 마치면 편집할 수 있어요.";
    case "unauthorized":
      // "입력한 값은 그대로 있어요"를 쓰지 않는다 — 중간 상태를 저장하지 않으므로 거짓이다.
      return "로그인이 만료됐어요. 다시 로그인한 뒤 처음부터 진행해 주세요.";
    default:
      // 사유를 추가하면 여기서 컴파일 에러가 난다. 실행 시점의 모르는 값은 접는다(위 ⚠️).
      error satisfies never;
      return "프로젝트를 만들지 못했어요. 처음부터 다시 시도해 주세요.";
  }
}

/**
 * 첫 적재 결과의 헤드라인 — 불변식 9: **0건이 아니면 성공 문구를 그대로 쓰지 않는다.**
 * `pullMessage`의 "다만 N건은 반영되지 못했어요" 형이다.
 *
 * @param failed `read.errors.length + duplicateKeys`
 */
export function ingestHeadline(count: number, failed: number): string {
  if (failed === 0) return `${count}개 키를 적재했어요.`;
  return `${count}개를 적재했지만 ${failed}건을 읽지 못했어요.`;
}
