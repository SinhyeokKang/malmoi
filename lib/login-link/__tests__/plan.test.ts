import { expect, it } from "vitest";

import { planLinkConfirm, planLinkOffer } from "../plan";
import type { Challenge } from "../policy";

/**
 * 거부를 안내로 바꾸는 판정 둘 (ARCHITECTURE "계정 병합").
 *
 * ⚠️ **자동 병합은 없다** — `offer`는 "화면을 보여줘도 되는가"까지이고, 행을 쓰는 것은
 * 기존 provider의 OAuth를 새로 통과한 `planLinkConfirm`의 `ok` 하나뿐이다.
 */

const base = {
  provider: "google",
  providerAccountId: "g1",
  verifiedEmail: "a@example.com",
  existingUser: { id: "u1", methods: ["github"] as readonly string[] },
};

it("검증 이메일이 없으면 거부다 — 현재 동작을 그대로 둔다", () => {
  expect(planLinkOffer({ ...base, verifiedEmail: null })).toEqual({ kind: "reject" });
  expect(planLinkOffer({ ...base, verifiedEmail: "" })).toEqual({ kind: "reject" });
  // 빈 이메일이면 기존 사용자를 조회하기 전에 거부한다 — 이메일이 같을 때만 병합한다(불변식 1).
  expect(planLinkOffer({ ...base, verifiedEmail: "", existingUser: null })).toEqual({ kind: "reject" });
});

it("같은 주소의 다른 수단이 있으면 안내를 제안한다", () => {
  expect(planLinkOffer(base)).toEqual({ kind: "offer", userId: "u1", have: "github" });
  expect(planLinkOffer({ ...base, provider: "github", providerAccountId: "gh9", existingUser: { id: "u1", methods: ["google"] } }))
    .toEqual({ kind: "offer", userId: "u1", have: "google" });
  // `github-app`은 세지 않는다 — 로그인 수단이 아니라 리포 쓰기 연결이다.
  expect(planLinkOffer({ ...base, existingUser: { id: "u1", methods: ["github-app", "github"] } }))
    .toEqual({ kind: "offer", userId: "u1", have: "github" });
});

it("평범한 로그인·가입은 그대로 지나간다", () => {
  // 같은 주소의 User가 없다 = 신규 가입이거나 이미 연결된 계정의 재로그인.
  expect(planLinkOffer({ ...base, existingUser: null })).toEqual({ kind: "sign-in" });
  // 로그인 수단이 하나도 없는 User(고아 행)에는 붙일 상대가 없다.
  expect(planLinkOffer({ ...base, existingUser: { id: "u1", methods: [] } })).toEqual({ kind: "sign-in" });
  // `github-app`은 로그인 수단이 아니다 — 그것만 가진 User는 확인시킬 상대가 없다.
  expect(planLinkOffer({ ...base, existingUser: { id: "u1", methods: ["github-app"] } })).toEqual({ kind: "sign-in" });
  // 같은 provider의 다른 계정은 병합 대상이 아니다 — 현재 거부(OAuthAccountNotLinked)를 유지한다.
  expect(planLinkOffer({ ...base, existingUser: { id: "u1", methods: ["google"] } })).toEqual({ kind: "sign-in" });
  // 알 수 없는 provider는 애초에 갈래가 아니다.
  expect(planLinkOffer({ ...base, provider: "github-app" })).toEqual({ kind: "sign-in" });
});

const challenge: Challenge = {
  userId: "u1",
  provider: "google",
  providerAccountId: "g1",
  dest: { kind: "projects" },
};
const confirm = {
  challenge,
  confirming: { provider: "github", providerAccountId: "gh1" },
  confirmedUserId: "u1",
  pendingLinked: false,
  expires: new Date(100),
  now: new Date(99),
};

it("확인이 일치하면 붙이고 소비한다", () => {
  expect(planLinkConfirm(confirm)).toEqual({ kind: "ok", consume: true });
});

/** ⚠️ **만료가 `wrong-account`보다 앞이다** — 만료된 challenge가 누구 것이었는지 말하지 않는다. */
it("만료 판정이 계정 대조보다 앞이다", () => {
  expect(planLinkConfirm({ ...confirm, now: new Date(100) })).toEqual({ kind: "expired", consume: false });
  expect(planLinkConfirm({ ...confirm, now: new Date(100), confirmedUserId: "other" }))
    .toEqual({ kind: "expired", consume: false });
  expect(planLinkConfirm({ ...confirm, now: new Date(99), expires: new Date(NaN) }))
    .toEqual({ kind: "expired", consume: false });
});

/**
 * ⚠️ **실패는 challenge를 소비하지 않는다** (design ⑧) — 소비하면 훔친 URL 한 번으로 피해자의
 * 병합을 태울 수 있다. 상한은 10분 TTL이 든다.
 */
it("실패 갈래는 아무것도 소비하지 않는다", () => {
  expect(planLinkConfirm({ ...confirm, confirmedUserId: "u2" })).toEqual({ kind: "wrong-account", consume: false });
  expect(planLinkConfirm({ ...confirm, confirmedUserId: null })).toEqual({ kind: "wrong-account", consume: false });
  expect(planLinkConfirm({ ...confirm, pendingLinked: true })).toEqual({ kind: "already-linked", consume: false });
  expect(planLinkConfirm({ ...confirm, confirming: { provider: "google", providerAccountId: "g1" } }))
    .toEqual({ kind: "invalid", consume: false });
  for (const outcome of [
    planLinkConfirm({ ...confirm, now: new Date(100) }),
    planLinkConfirm({ ...confirm, confirmedUserId: "u2" }),
    planLinkConfirm({ ...confirm, pendingLinked: true }),
  ]) {
    expect(outcome.consume).toBe(false);
  }
});

it("확인 계정을 못 찾으면 wrong-account다 — 처음 보는 GitHub은 그 자체로 다른 계정이다", () => {
  expect(planLinkConfirm({ ...confirm, confirmedUserId: null })).toEqual({ kind: "wrong-account", consume: false });
});
