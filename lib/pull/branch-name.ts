/**
 * 사용자가 입력한 **base 브랜치 이름**의 형식 판정 (translation-ui design §3.13, 6b-3).
 *
 * ⚠️ **`isRefSafeSlug`(`lib/pull/ref-slug.ts`)보다 넓다.** 그쪽은 **우리가 만드는** ref
 * (`l10n/sync-<slug>`)라 한 세그먼트로 좁혀야 하고, 이쪽은 **남의 리포에 이미 있는** 브랜치라
 * `/`·대문자·`.`을 받아야 한다(`release/2.0`·`feat/UI-1`이 정상이다). 둘을 한 함수로 합치면
 * 한쪽이 반드시 틀린다.
 *
 * ⚠️ **`git check-ref-format`의 부분집합이다.** 전부 구현하지 않는다 — 우리가 막는 것은 "사람이
 * 오타로 넣을 수 있고 넣으면 pull이 이해하지 못하는 값"이고, GitHub이 거부할 나머지는 pull이
 * "base 브랜치를 읽을 수 없다"로 **시끄럽게** 실패한다(조용히 안 도는 것보다 낫다).
 *
 * ⚠️ **트림하지 않는다 — 앞뒤 공백은 거부다.** 트림하면 화면이 보여준 값과 저장된 값이 갈리고,
 * `checkFormat`이 저장값을 그대로 비교하므로 그 차이가 조용한 409가 된다(`guard.ts`가 포맷 셋을
 * 트림하지 않는 것과 같은 근거).
 *
 * ⚠️ **import이 없어야 한다 — 잎이다.** 설정 화면(클라이언트)이 이 판정을 값으로 읽는다.
 * `ref-slug.ts`가 같은 이유로 `trigger.ts`에서 내려왔고, 그때 그 그래프(octokit·ts-morph)가
 * 클라이언트 번들에 7.2MB로 들어갔다 (POSTMORTEM 2026-09-07).
 */

/**
 * 제어문자·공백(`U+0020` 포함) · glob(`?*[`) · refspec(`~^:`) · 이스케이프(`\`).
 *
 * ⚠️ **이스케이프 표기로 쓴다** — 실제 제어 바이트를 넣으면 파일이 binary가 되고
 * `lib/__tests__/no-nul-bytes.test.ts`가 그것을 막는다.
 */
const FORBIDDEN = /[\u0000-\u0020\u007f~^:?*[\\]/;

export function isValidBranchName(name: string): boolean {
  // `@` 단독은 git이 HEAD의 별칭으로 읽는다.
  if (name === "" || name === "@") return false;
  if (FORBIDDEN.test(name)) return false;
  // `..`는 범위 문법(`a..b`), `@{`는 reflog 문법(`main@{1}`)이다.
  if (name.includes("..") || name.includes("@{")) return false;
  /**
   * 세그먼트 단위 규칙이 앞뒤 `/`·`//`까지 함께 막는다 — 그 경우 빈 세그먼트가 생긴다.
   * `.lock` 접미는 git이 잠금 파일 이름으로 쓰므로 **컴포넌트 끝**에서 거부된다.
   */
  return name
    .split("/")
    .every((seg) => seg !== "" && !seg.startsWith(".") && !seg.endsWith(".") && !seg.endsWith(".lock"));
}
