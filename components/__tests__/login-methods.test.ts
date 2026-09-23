import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const ROOT = process.cwd();
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const CARD = strip(readFileSync(join(ROOT, "components/account/login-methods.tsx"), "utf8"));
const PAGE = strip(readFileSync(join(ROOT, "app/(edit)/account/page.tsx"), "utf8"));
const ACTIONS = strip(readFileSync(join(ROOT, "app/(edit)/account/actions.ts"), "utf8"));
const GITHUB_SECTION = strip(readFileSync(join(ROOT, "components/account/github-section.tsx"), "utf8"));

/** 로그인 수단 추가는 별도 challenge 경로를 쓴다. GitHub App 연결과 섞지 않는다. */
it("로그인 수단 추가는 GitHub App 연결과 분리된다", () => {
  expect(CARD).toContain("unlinkLoginMethod");
  expect(CARD).toContain("startLoginMethodConnect.bind");
  expect(CARD).toContain("useFormStatus");
  expect(CARD).not.toMatch(/\bConnect\b/);
  expect(CARD).not.toContain("startGithubConnectForUser");
  expect(CARD).not.toContain("signIn(");
});

/**
 * ⚠️ **사유 없는 disabled는 이 리포가 반복해 밟은 부류다** (POSTMORTEM 2026-09-06) — 관용구는
 * 멤버 화면의 **행 옆 인라인**이다.
 */
it("마지막 수단은 비활성이고 사유가 그 행 옆에 있다 — 포커스를 받는 aria-disabled다 (audit #37)", () => {
  expect(CARD).toContain("canUnlink");
  expect(CARD).toContain("m.link.methods.lastMethod");
  expect(CARD).toMatch(/aria-describedby=\{reasonId\} aria-disabled/);
  expect(CARD).not.toMatch(/disabled=\{true\}/);
});

/**
 * ⚠️ **해제에 확인 `Dialog`가 있다.** 되돌리려면 OAuth 왕복 전체가 필요하고, DESIGN §6.67이 그것을 알림
 * 부재의 보상으로 든다 — 멤버 제거와 같은 무게다.
 *
 * ⚠️ **"`DisconnectGithubButton`은 확인 없이 한 번 클릭"이라는 옛 근거를 지웠다** (2026-09-13에
 * 그쪽에도 Dialog가 붙었다). **복구가 쉬운 것과 결과가 가벼운 것은 다른 축이다** — 프로덕션 주석은
 * 그때 고쳤는데 이 사본이 남아 다음 사람에게 비대칭을 정당화하고 있었다 (2026-09-14 리뷰 🟢6).
 */
it("해제가 확인을 한 번 받는다", () => {
  expect(CARD).toContain("DialogContent");
  expect(CARD).toContain("m.link.methods.confirmDisconnect");
});

/** ⚠️ **`Account` PK가 `(provider, providerAccountId)`라 그 둘만으로 남의 행에 닿는다.** */
it("해제 쿼리가 `userId`로 좁혀져 있다", () => {
  const action = /export async function unlinkLoginMethod[\s\S]*?\n}/.exec(ACTIONS)?.[0] ?? "";
  expect(action).toContain("requireUser(");
  expect(action).toMatch(/deleteMany\(\{\s*where:\s*\{\s*userId/);
  // 순수 판정이 먼저 거른다 — Action이 유일한 방어선이 아니다.
  expect(action).toContain("canUnlink(");
});

/**
 * ⚠️ **`entry-points.test.ts`의 "쿼리 짝" 단언만으로는 red가 안 난다** — 그 검사는
 * `page.source.includes("searchParams")` 한 줄이고 `/account`는 이미 그것을 읽는다. 재는 문장을
 * 바꾼다: **`Raw<…>`에 `"link"`가 있고 `firstQueryValues` 구조분해에도 있다.**
 */
it("결과를 보내는 쪽과 읽는 쪽이 같은 커밋에 있다", () => {
  expect(ACTIONS).toContain("routes.account({ link:");
  expect(PAGE).toMatch(/Raw<[^>]*"link"[^>]*>/);
  expect(PAGE).toMatch(/const \{[^}]*link[^}]*\} = firstQueryValues/);
  expect(PAGE).toContain("linkErrorMessage");
});

/**
 * ⚠️ **같은 화면에 "GitHub"이 두 번 나온다** — 로그인 수단과 리포 쓰기 권한은 다른 축이고 그
 * 구별이 화면에서 보여야 한다. 카드 제목·설명이 그 일을 한다.
 */
it("GitHub App 연결 카드와 제목이 갈린다", () => {
  /**
   * ⚠️ **제목이 화면 파일에서 구역 컴포넌트로 내려갔다** (2026-09-13 — 머리 하나 + 리스트 셋).
   * 구별을 카드 설명문에 맡기던 것이 이 재편의 원인이었으므로, 지금 그 일을 하는 것은 **구역
   * 제목**이다. 순서는 화면이 정하므로 그쪽에서 잰다.
   */
  expect(CARD).toContain("m.link.methods.title");
  // ⚠️ **새 키다** (2026-09-16) — `m.settings.account.title`(`GitHub account`)은 프로젝트 설정
  // 화면이 계속 쓰고, 이 카드의 축 이름만 `GitHub App`으로 갈렸다.
  expect(GITHUB_SECTION).toContain("m.account.github.title");
  expect(PAGE.indexOf("<LoginMethods")).toBeLessThan(PAGE.indexOf("<GithubSection"));
  expect(PAGE.indexOf("<LoginMethods")).toBeGreaterThan(-1);
});
