import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const ROOT = process.cwd();

/**
 * ⚠️ **양방향 쿠키 정리가 배타성의 전부다** (account-linking design 불변식 8c) — 두 가로채기의
 * intent 판정에 암호적 결합이 없으므로, 시작하는 쪽이 상대의 흔적을 먼저 지워야 한다.
 * 한 방향만 지우면 "회수를 중단한 직후 병합"이 회수 화면으로 새고, 그 증상은 버튼이 엉뚱한
 * 화면을 낸 것으로만 보인다 (POSTMORTEM 2026-09-10).
 */
it("회수 시작이 병합 쿠키를 먼저 지운다", () => {
  const source = readFileSync(join(ROOT, "app/(edit)/account/actions.ts"), "utf8");
  expect(source).toContain("clearAuthRoundtripCookies(");
  expect(source.indexOf("clearAuthRoundtripCookies(")).toBeLessThan(source.indexOf("beginRevocation("));
});

it("병합 시작이 회수 쿠키를 먼저 지운다", () => {
  const source = readFileSync(join(ROOT, "app/signin/link/[challenge]/page.tsx"), "utf8");
  expect(source).toContain("clearAuthRoundtripCookies(");
  expect(source.indexOf("clearAuthRoundtripCookies(")).toBeLessThan(source.lastIndexOf("signIn("));
  // 시작 스코프 안에서 signIn을 불러야 state가 우리 쿠키 이름으로 저장된다.
  expect(source).toMatch(/withLinkStart\(/);
});

/**
 * ⚠️ **`safePrismaAdapter.linkAccount`의 거부를 한 줄도 약하게 하지 않는다** (design 불변식 2).
 * 병합은 `finishLink`가 직접 쓰므로 그 게이트를 열 이유가 없다 — **Auth.js 경유의 유일한 경로**로
 * 뜻만 좁아진다.
 */
it("어댑터 게이트가 그대로이고 직접 쓰는 자리가 하나뿐이다", () => {
  // 문서 주석의 경로 참조는 실행 의존성이 아니다. 게이트 코드는 계속 같은 조건으로 검사한다.
  const adapter = readFileSync(join(ROOT, "lib/auth/safe-adapter.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  expect(adapter).toContain("additional login accounts are disabled");
  expect(adapter).not.toContain("login-link");

  /**
   * ⚠️ **`Account` 행을 만드는 자리의 허용 목록이다.** 셋의 축이 각각 다르다:
   * 어댑터(Auth.js 경유 첫 로그인) · 병합(우리가 직접 쓰는 **로그인 수단**) ·
   * GitHub App 연결(`github-app` — **로그인 수단이 아니라 리포 쓰기 권한**이다).
   * 넷째가 생기면 "로그인 수단은 User당 하나"의 예외가 문서 없이 하나 더 생긴 것이다.
   */
  const creators = ["lib/login-link/store.ts", "lib/auth/safe-adapter.ts", "app/api/github/callback/route.ts"];
  const scan = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry: string) => {
      if (entry === "node_modules" || entry === "generated" || entry.startsWith(".")) return [];
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) return scan(full);
      return /\.tsx?$/.test(entry) ? [full] : [];
    });
  const writers = [...scan(join(ROOT, "lib")), ...scan(join(ROOT, "app"))]
    .filter((file) => !file.includes("__tests__"))
    .filter((file) => /\baccount\.create\(|\baccount:\s*\{\s*create\b/.test(readFileSync(file, "utf8")))
    .map((file) => file.slice(ROOT.length + 1));
  expect(writers.sort()).toEqual([...creators].sort());
});
