import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const ROOT = process.cwd();
const VIEW = readFileSync(join(ROOT, "lib/login-link/view.ts"), "utf8");
const PAGE = readFileSync(join(ROOT, "app/signin/link/[challenge]/page.tsx"), "utf8");

/**
 * ⚠️ **비로그인이 여는 화면이다.** 클라이언트에서 가리는 것은 방어가 아니다 — 원문이 이미 RSC
 * 페이로드에 있다 (`loadMembers`가 원문 이메일을 안 돌려주는 것과 같은 규칙, sec-audit 발견 4).
 * `server-only`라 렌더 테스트로 못 잡으므로 소스로 센다 (`members-screen.test.ts`와 같은 형).
 *
 * ⚠️ **2026-09-12에 이름·이미지가 허용으로 뒤집혔다** (사용자) — 이 화면에 도달한 사람은 그
 * 주소를 IdP에서 이미 검증받았고, 가린 대가로 아바타가 셸과 다른 얼굴이 됐다. **이메일 원문은
 * 계속 안 나간다** — 그것이 마스킹의 대상이고, 여기서 재는 것도 그것 하나다.
 */
it("화면에 내려보내는 타입에 원문 이메일이 없다", () => {
  const declared = /export type ChallengeView = \{([\s\S]*?)\n\};/.exec(VIEW)?.[1];
  expect(declared, "ChallengeView 선언을 못 찾았다").toBeDefined();
  expect(declared).toContain("emailLabel");
  // `emailLabel`은 걸리지 않게 단어 경계로 좁힌다 — 재는 것은 **원문 필드**다.
  expect(declared).not.toMatch(/(^|[^a-zA-Z])email\s*:/);
  // 마스킹의 주인이 서버다.
  expect(VIEW).toMatch(/maskEmail\(/);
});

/**
 * ⚠️ **계정 "내용"은 계속 안 싣는다** — 프로젝트 수·멤버 목록은 수락 여부를 안 바꾸고 규모만
 * 새게 한다. 이름·이미지가 열린 것이 이 경계까지 여는 것은 아니다.
 */
it("계정 내용을 조회하지 않는다", () => {
  for (const forbidden of ["projectMember", "project.", "_count", "translation"]) {
    expect(VIEW).not.toContain(forbidden);
  }
});

it("화면은 서버가 만든 값만 읽는다 — 원문을 다시 조회하지 않는다", () => {
  expect(PAGE).toContain("view.emailLabel");
  expect(PAGE).not.toMatch(/decodeUser\(/);
  expect(PAGE).not.toMatch(/\bprisma\.user\b/);
});

/**
 * ⚠️ **만료를 이 화면으로 말하지 않는다** (완료 조건 5) — 다시 그리면 그 상태가 또 하나의
 * 표면이 된다. 장애는 그것과 다른 사유로 간다.
 */
it("만료는 로그인 화면으로 되돌리고 장애와 갈린다", () => {
  expect(PAGE).toMatch(/redirect\(routes\.signIn\(\{ error: "LinkExpired" \}\)\)/);
  expect(PAGE).toMatch(/redirect\(routes\.signIn\(\{ error: "Unavailable" \}\)\)/);
});
