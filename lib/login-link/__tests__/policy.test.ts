import { expect, it } from "vitest";

import {
  CHALLENGE_TTL_MINUTES,
  canUnlink,
  challengeIdentifier,
  challengePrefix,
  checkChallenge,
  destFromCallbackUrl,
  failureUrl,
  isLoginProvider,
  linkCookie,
  linkStateCookie,
  loginMethodRows,
  outcomeUrl,
  parseChallengeIdentifier,
  pickLoginAccount,
  type Challenge,
} from "../policy";

/**
 * 병합 challenge의 순수 판정 (design §5.2).
 *
 * ⚠️ **`session-revocation`과 형은 같지만 증명이 다르다** — 그쪽은 살아 있는 세션이 인가를 대신해
 * `sessionDigest`·`stateDigest`를 담지만, 여기는 세션이 **없다**. 담는 것은 "무엇을 붙일 것인가"와
 * "성공하면 어디로 돌아가나"뿐이고, 왕복의 진정성은 Auth.js가 자기 이름·salt로 암호화한 state
 * 쿠키가 든다 (design 불변식 3).
 */

const challenge: Challenge = {
  userId: "u1",
  provider: "google",
  providerAccountId: "g1",
  dest: { kind: "invite", token: "invite-token" },
};

it("challenge는 붙일 계정과 복귀 지점을 담고 원문 토큰은 담지 않는다", () => {
  const id = challengeIdentifier(challenge);
  expect(parseChallengeIdentifier(id)).toEqual(challenge);
  expect(id.startsWith(challengePrefix("u1"))).toBe(true);
  expect(id.startsWith(challengePrefix("u10"))).toBe(false);
  expect(id).not.toContain("raw-challenge");
  expect(parseChallengeIdentifier(challengeIdentifier({ ...challenge, dest: { kind: "projects" } }))).toEqual({
    ...challenge,
    dest: { kind: "projects" },
  });
});

it("모호한 ID·다른 목적·알 수 없는 provider·여분 필드를 거부한다", () => {
  const id = challengeIdentifier(challenge);
  for (const value of [
    "{}",
    "[]",
    "null",
    id.replace("v1", "v2"),
    id.replace("malmoi/login-link", "malmoi/session-revocation"),
    id.replace('"google"', '"github-app"'),
    id.replace(/]$/, ',"extra"]'),
    id.replace('"invite"', '"external"'),
  ]) {
    expect(parseChallengeIdentifier(value)).toBeNull();
  }
});

it("수명 판정: 만료가 provider 불일치보다 앞이고, 붙일 provider로는 확인할 수 없다", () => {
  const live = { confirming: "github", expires: new Date(100), now: new Date(99) };
  expect(checkChallenge(challenge, live)).toBe("ok");
  expect(checkChallenge(challenge, { ...live, now: new Date(100) })).toBe("expired");
  expect(checkChallenge(challenge, { ...live, expires: new Date(NaN) })).toBe("expired");
  // 붙이려는 provider로 돌아온 callback은 확인이 아니다 — 소유를 두 번 증명한 것이 아니다.
  expect(checkChallenge(challenge, { ...live, confirming: "google" })).toBe("invalid");
  expect(checkChallenge(challenge, { ...live, confirming: "github-app" })).toBe("invalid");
  // 만료가 앞이다: 만료된 challenge가 누구 것이었는지 말하지 않는다.
  expect(checkChallenge(challenge, { ...live, confirming: "google", now: new Date(100) })).toBe("expired");
  expect(CHALLENGE_TTL_MINUTES).toBe(10);
});

it("확인 상대는 결정적으로 고른다 — github 우선", () => {
  const github = { provider: "github", providerAccountId: "gh" };
  const google = { provider: "google", providerAccountId: "g" };
  expect(pickLoginAccount([github])).toEqual(github);
  expect(pickLoginAccount([google])).toEqual(google);
  expect(pickLoginAccount([google, github])).toEqual(github);
  expect(pickLoginAccount([github, google])).toEqual(github);
  expect(pickLoginAccount([])).toBeNull();
  // `github-app`은 로그인 수단이 아니다 — 리포 쓰기 연결이다.
  expect(pickLoginAccount([{ provider: "github-app", providerAccountId: "app" }])).toBeNull();
});

it("수단 목록은 둘을 고정 순서로 내고, 마지막 하나는 해제할 수 없다", () => {
  expect(loginMethodRows([{ provider: "google" }])).toEqual([
    { provider: "github", connected: false },
    { provider: "google", connected: true },
  ]);
  expect(loginMethodRows([{ provider: "google" }, { provider: "github" }, { provider: "github-app" }])).toEqual([
    { provider: "github", connected: true },
    { provider: "google", connected: true },
  ]);
  expect(canUnlink(["github"], "github")).toBe(false);
  expect(canUnlink(["github", "google"], "github")).toBe(true);
  expect(canUnlink(["github", "google"], "google")).toBe(true);
  // 붙어 있지 않은 수단은 해제 대상이 아니다.
  expect(canUnlink(["github", "google"], "github-app")).toBe(false);
  expect(canUnlink([], "github")).toBe(false);
});

/**
 * ⚠️ **`dest`가 문자열이 아니라 갈래다** (design 불변식 9) — 저장된 문자열을 그대로 리다이렉트에
 * 쓰면 open redirect 판정이 생기고, 그 판정을 잊는 것이 조용하다.
 */
it("성공 착지는 갈래 이름으로만 만들어진다 — 임의 URL을 받는 자리가 없다", () => {
  expect(outcomeUrl({ kind: "invite", token: "abc" })).toBe("/invite/abc");
  expect(outcomeUrl({ kind: "projects" })).toBe("/projects");
  // 저장된 identifier가 외부 URL을 물고 있어도 파싱 자체가 거부한다.
  expect(parseChallengeIdentifier(challengeIdentifier(challenge).replace('"invite"', '"https://evil.test"'))).toBeNull();
});

it("복귀 지점은 callback-url에서 갈래로만 읽는다 — 외부 URL은 목록으로 접는다", () => {
  expect(destFromCallbackUrl("http://localhost/invite/abc")).toEqual({ kind: "invite", token: "abc" });
  expect(destFromCallbackUrl("%2Finvite%2Fabc")).toEqual({ kind: "invite", token: "abc" });
  for (const value of [
    undefined,
    "",
    "http://localhost/projects",
    "https://evil.test/invite/abc".replace("/invite/abc", ""),
    "http://localhost/invite/abc/extra",
    "http://localhost/invite/",
    "::not a url::",
  ]) {
    expect(destFromCallbackUrl(value)).toEqual({ kind: "projects" });
  }
  // ⚠️ **외부 호스트여도 경로만 본다** — origin은 버리고 갈래만 남으므로 리다이렉트에 못 실린다.
  expect(destFromCallbackUrl("https://evil.test/invite/abc")).toEqual({ kind: "invite", token: "abc" });
});

it("실패는 같은 화면으로 돌아가고, 토큰이 없으면 로그인 화면이다", () => {
  expect(failureUrl("abc", "wrong-account")).toBe("/signin/link/abc?e=wrong-account");
  expect(failureUrl("abc", "already-linked")).toBe("/signin/link/abc?e=already-linked");
  expect(failureUrl("abc", "cancelled")).toBe("/signin/link/abc?e=cancelled");
  // ⚠️ 돌아갈 challenge가 없는 갈래는 그 화면으로 보내지 않는다 — 사유 없이 한 번 더 튕긴다.
  expect(failureUrl("abc", "expired")).toBe("/signin?error=LinkExpired");
  expect(failureUrl("abc", "invalid")).toBe("/signin?error=LinkExpired");
  expect(failureUrl(null, "wrong-account")).toBe("/signin?error=LinkExpired");
});

it("쿠키 이름 둘은 secure 접두를 가르고 Auth.js state와 이름이 겹치지 않는다", () => {
  expect(linkCookie(true).name).toBe("__Host-malmoi-login-link");
  expect(linkCookie(false).name).toBe("malmoi-login-link");
  expect(linkStateCookie(true).name).toBe("__Secure-malmoi-link-state");
  expect(linkStateCookie(false).name).toBe("malmoi-link-state");
  // 회수 왕복과 이름이 갈려야 두 가로채기가 서로를 먹지 않는다 (design 불변식 8).
  expect(linkStateCookie(true).name).not.toContain("revocation");
  for (const cookie of [linkCookie(true), linkStateCookie(true)]) {
    expect(cookie.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", secure: true });
  }
});

it("로그인 provider 판정은 github-app을 배제한다", () => {
  expect(isLoginProvider("github")).toBe(true);
  expect(isLoginProvider("google")).toBe(true);
  expect(isLoginProvider("github-app")).toBe(false);
  expect(isLoginProvider("__proto__")).toBe(false);
});
