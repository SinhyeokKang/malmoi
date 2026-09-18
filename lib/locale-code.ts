/**
 * **경로 조각으로 안전한가** — 로케일 코드와 리포 경로의 순수 판정 (sec-audit 발견 2).
 *
 * ⚠️ **잎이다 — import가 0개다.** `lib/routes.ts`·`lib/relative-time.ts`와 같은 층이고, 그래야
 * push 스키마(`lib/push/plan.ts`)와 pull 판정(`lib/pull/plan.ts`)이 **서로의 그래프를 안 끌고**
 * 같은 규칙을 쓴다. `lib/pull/ref-slug.ts`가 같은 이유로 내려온 선례다 (POSTMORTEM 2026-09-07).
 *
 * ⚠️ **`looksLikeLocale`(`lib/adapters/shared.ts`)을 재사용하지 않는다.** 그 함수는 *탐지* 규칙이라
 * "우연히 로케일로 보이는 디렉터리인가"를 묻고 2~3자 소문자를 받는다 — 여기는 "이 문자열을 리포
 * 경로에 넣어도 되는가"이고 축이 다르다. 그리고 그 디렉터리를 import하면 ARCHITECTURE §1.9 재측정
 * 트리거가 붙는다.
 */

/** 로케일 코드 길이 상한 — `zh-Hant-TW`가 10자다. 여유를 크게 두되 파일명 한 조각을 넘지 않는다. */
export const MAX_LOCALE_CODE_LENGTH = 35;
/** 리포 경로·템플릿 길이 상한. `lib/adapters/shared.ts`의 글롭 예산과 같은 값이다. */
export const MAX_REPO_PATH_LENGTH = 200;

/** 경로에 넣어도 되는 문자만 — 점이 없으므로 `..`는 자동으로 걸린다. */
const UNSAFE_LOCALE_CHAR = /[^A-Za-z0-9_-]/;
/** 제어문자는 경로에 들어가면 안 된다 — 트리 엔트리로 나가고 되돌릴 수 없다. */
const CONTROL_CHAR = /[\u0000-\u001f\u007f]/;
/** 첫 글자 — `-`·`_`로 시작하면 CLI 플래그·숨김 파일과 헷갈리는 이름이 된다. */
const LOCALE_HEAD = /[A-Za-z0-9]/;

/**
 * 이 로케일 코드를 파일 경로에 보간해도 되는가.
 *
 * ⚠️ **허용 문자 앵커(`^…$`)가 아니라 부정 문자 클래스로 훑는다.** JS의 `$`는(`m` 플래그 없이) 입력 끝에서만 맞아
 * `"en\n"`을 막지만, 같은 규칙을 Python·Ruby·PCRE로 옮기면 `$`가 **마지막 개행 앞**에서도 맞아 통과한다 — 부정 클래스는
 * 어느 엔진에서도 그 구멍이 없다.
 */
export function isPathSafeLocale(code: string): boolean {
  if (code.length === 0 || code.length > MAX_LOCALE_CODE_LENGTH) return false;
  if (UNSAFE_LOCALE_CHAR.test(code)) return false;
  return LOCALE_HEAD.test(code.slice(0, 1));
}

/**
 * 이 경로가 리포 안에 머무는가 — 템플릿(`{locale}`·`*` 포함)과 치환 결과 **둘 다**에 건다.
 *
 * 슬래시는 정당하다(`public/_locales/{locale}/messages.json`). 막는 것은 **디렉터리를 거슬러
 * 오르는 것**과 절대 경로다. `..` 하나면 `malmoi-i18n/sync-<slug>` 브랜치의 커밋이 워크플로 파일을
 * 만들 수 있고, 그 브랜치 push가 대상 리포의 secret과 함께 그것을 실행시킨다.
 */
export function isPathSafeRepoPath(path: string): boolean {
  if (path.length === 0 || path.length > MAX_REPO_PATH_LENGTH) return false;
  if (CONTROL_CHAR.test(path) || path.includes("\\")) return false;
  // 빈 세그먼트가 걸리므로 선행 `/`·`//`·끝 `/`가 함께 닫힌다.
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}
