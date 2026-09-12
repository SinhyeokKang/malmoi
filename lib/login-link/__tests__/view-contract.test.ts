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
 */
it("화면에 내려보내는 타입에 원문 이메일이 없다", () => {
  const declared = /export type ChallengeView = \{([^}]*)\}/.exec(VIEW)?.[1];
  expect(declared, "ChallengeView 선언을 못 찾았다").toBeDefined();
  expect(declared).toContain("emailLabel");
  expect(declared).not.toMatch(/\bemail\s*:/);
  expect(declared).not.toMatch(/\bname\s*:/);
  expect(declared).not.toMatch(/\bimage\s*:/);
  // 마스킹의 주인이 서버다.
  expect(VIEW).toMatch(/maskEmail\(/);
});

it("화면은 마스킹한 라벨만 읽는다 — 원문을 다시 조회하지 않는다", () => {
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
