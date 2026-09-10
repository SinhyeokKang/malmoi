import { fail } from "@/lib/failure";

/**
 * 리포의 **정체성**은 이름이 아니라 GitHub이 붙인 불변 id다 (sec-audit-2 발견 34).
 *
 * ⚠️ **이름은 재사용된다.** 리포 A를 리네임하면 GitHub이 옛 이름으로의 redirect를 걸어 주지만,
 * **같은 조직이 그 이름으로 새 리포 B를 만드는 순간 그 redirect가 사라진다.** 그러면 저장된
 * `repoOwner/repoName`이 가리키는 곳이 B이고, 우리 설치가 B에도 닿으면 pull이 **A의 번역을 B에**
 * 커밋한다. B가 public이면 그대로 공개다.
 *
 * 그래서 판정을 둘로 가른다 — **저장된 pin이 쓸 수 있는 모양인가**(`requirePinnedRepositoryId`)와
 * **지금 그 주소에 있는 것이 그 리포인가**(`requireSameRepository`). 한 함수에 합치면 호출부가
 * 같은 값을 두 인자로 넘겨 자기 자신과 비교하게 되고, 다음 사람이 둘 중 하나를 지운다.
 */

/** GitHub repository id의 모양 — 양의 정수 십진수. 선행 0을 허용하면 같은 리포가 두 문자열이 된다. */
const REPOSITORY_ID = /^[1-9][0-9]*$/;

/**
 * 저장된 pin을 쓸 수 있는 형태로 꺼낸다. **없으면 던진다** — 옛 행(컬럼이 생기기 전에 만들어진
 * 프로젝트)이 여기로 오고, 그것은 "이름만 맞는 상태"라 쓰기를 허용할 근거가 아니다. OWNER가
 * 설정에서 [다시 연결]을 한 번 누르면 고정된다.
 *
 * ⚠️ **`Number.isSafeInteger`까지 여기서 본다.** 정규식만 보면 자릿수가 넘치는 값이 통과하고,
 * `Number()`가 반올림한 id가 **다른 리포의 id와 같아질 수 있다** — 그 값이 설치 토큰의
 * `repositoryIds`로 들어간다.
 */
export function requirePinnedRepositoryId(pinned: string | null | undefined): string {
  if (!pinned || !REPOSITORY_ID.test(pinned) || !Number.isSafeInteger(Number(pinned))) {
    fail("repository identity is not pinned; reconnect the project", "not-installed");
  }
  return pinned;
}

/** 지금 그 주소가 준 id가 pin과 같은가 — 다르면 **쓰기 전에** 멈춘다. */
export function requireSameRepository(pinned: string, actual: string): void {
  if (pinned !== actual) {
    fail("repository identity changed; reconnect the project", "not-installed");
  }
}
