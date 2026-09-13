// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";

import { render } from "@/components/__tests__/helpers/dom";
import { m } from "@/lib/i18n";
import { encodeUserFields } from "@/lib/credentials/records";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), getPrisma: vi.fn(), loadAccountView: vi.fn(), loadConnectionUsage: vi.fn() }));
vi.mock("@/auth", () => ({ signOut: vi.fn(), signIn: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/db", () => ({ getPrisma: mocks.getPrisma }));
vi.mock("@/lib/github-connect/account-view", () => ({ loadAccountView: mocks.loadAccountView }));
vi.mock("@/lib/account/connection-usage", () => ({ loadConnectionUsage: mocks.loadConnectionUsage }));
vi.mock("@/app/(edit)/account/actions", () => ({
  updateProfileName: vi.fn(), uploadProfileImage: vi.fn(), deleteProfileImage: vi.fn(),
  startSessionRevocation: vi.fn(), unlinkLoginMethod: vi.fn(), startLoginMethodConnect: vi.fn(),
}));
vi.mock("@/app/(edit)/projects/actions", () => ({ disconnectGithub: vi.fn(), startGithubConnectForUser: vi.fn() }));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ startGithubConnect: vi.fn() }));

import AccountPage from "../page";

/**
 * 화면 구조의 방어선 (account-settings 태스크 10).
 *
 * ⚠️ **값이 아니라 구조를 센다.** 클래스 문자열을 박으면 스타일을 바꾸는 순간 green인 채 결함만
 * 돌아온다 — 세는 것은 "머리 하나 + 리스트 셋" · "되돌릴 수 없는 넷이 확인을 지난다" ·
 * "쿼리 셋이 각자 자리에 닿는다" · "사유 없는 `disabled`가 0이다" 넷이다.
 *
 * ⚠️ **화면을 실제로 렌더한다.** 요소 트리를 순회하는 소스 스캔은 이 부류를 못 본다 —
 * 조건부 갈래 하나가 통째로 빠져도 파일에는 그 코드가 남아 있다 (POSTMORTEM 2026-09-11).
 */
async function screen(params: Record<string, string> = {}, methods = [{ provider: "github" }, { provider: "google" }]) {
  mocks.requireUser.mockResolvedValue({ userId: "owner" });
  mocks.loadAccountView.mockResolvedValue({ status: "ok", login: "octocat" });
  mocks.loadConnectionUsage.mockResolvedValue(2);
  mocks.getPrisma.mockReturnValue({
    user: { findUnique: async () => ({ id: "owner", ...encodeUserFields("owner", { email: "a@x.com", name: "Jane", image: null }) }) },
    account: { findMany: async () => methods },
  });
  const { container } = await render(await AccountPage({ searchParams: Promise.resolve(params) }));
  return container;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PII_ENCRYPTION_KEYS", JSON.stringify({ k1: Buffer.alloc(32, 1).toString("base64") }));
  vi.stubEnv("PII_ENCRYPTION_ACTIVE_KEY_ID", "k1");
});

/**
 * ⚠️ **래퍼가 목록마다 하나다** — 항목마다 테두리를 주면 셋뿐인 목록이 카드 갤러리처럼 무거워지고,
 * 카드 다섯이 평평하게 쌓여 축이 안 보이던 그 상태로 돌아간다.
 */
it("머리 하나 + 리스트 셋이고 각 리스트가 래퍼 하나 안에 있다", async () => {
  const container = await screen();
  const lists = [...container.querySelectorAll("ul")];
  expect(lists).toHaveLength(3);
  expect(lists.map((list) => list.querySelectorAll(":scope > li").length)).toEqual([2, 1, 2]);
  // 항목이 자기 래퍼를 갖지 않는다 — `<li>` 안에 또 다른 목록 래퍼가 생기면 그 순간 갤러리다.
  for (const list of lists) expect(list.querySelectorAll("ul")).toHaveLength(0);
  // 머리 블록은 리스트 밖이다 — 아바타와 이름 필드가 어느 구역에도 속하지 않는다.
  expect(container.querySelector("h1")?.textContent).toBe(m.common.nav.settings);
});

/**
 * ⚠️ **확인 없이 제출하는 버튼이 0이다.** Radix `DialogTrigger`가 `aria-haspopup="dialog"`를 싣는
 * 것이 "이 컨트롤 뒤에 확인이 있다"의 렌더된 증거다 — 닫힌 Dialog는 트리에 없으므로 그 속성이
 * 유일하게 셀 수 있는 자리다.
 */
it("되돌릴 수 없는 것마다 확인이 붙고, 직접 제출하는 것이 없다", async () => {
  const container = await screen();
  const labels = [...container.querySelectorAll('[aria-haspopup="dialog"]')]
    .map((trigger) => trigger.getAttribute("aria-label") ?? trigger.textContent ?? "")
    .sort();
  /**
   * ⚠️ **갈래는 넷인데 컨트롤은 다섯이다** — 수단 해제가 연결된 수단마다 하나씩이다. 개수를 박으면
   * 수단이 하나만 연결된 화면에서 이 단언이 거짓이 되므로, **어느 것이 확인을 지나는가**를 센다.
   */
  expect(labels).toEqual([
    `${m.link.methods.disconnect} ${m.link.providers.github}`,
    `${m.link.methods.disconnect} ${m.link.providers.google}`,
    m.account.sessions.title,
    m.common.nav.signOut,
    m.settings.account.disconnect,
  ].sort());

  /**
   * ⚠️ **남은 폼이 되돌릴 수 있는 것뿐이다.** 확인을 지나는 것은 Dialog 안에서 제출하므로 닫힌
   * 화면의 트리에 없다 — 여기 보이는 `<form>`이 하나라도 늘면 확인 없이 제출하는 자리가 생긴 것이다.
   */
  const forms = [...container.querySelectorAll("form")];
  expect(forms).toHaveLength(1);
  expect(forms[0]!.querySelector("button")?.textContent).toBe(m.account.profile.save);
});

it("마지막 수단은 확인이 아니라 비활성이다 — 지날 문이 없다", async () => {
  const container = await screen({}, [{ provider: "github" }]);
  const labels = [...container.querySelectorAll('[aria-haspopup="dialog"]')]
    .map((trigger) => trigger.getAttribute("aria-label") ?? trigger.textContent ?? "");
  expect(labels).not.toContain(`${m.link.methods.disconnect} ${m.link.providers.github}`);
  expect(labels).toHaveLength(3);
});

/**
 * ⚠️ **셋이 같은 자리에 서지 않는다** — 앞의 둘은 머리 Alert이고 `?sessionRevocation=`는 Sessions
 * 구역 **안**이다. 실어 보내놓고 아무도 안 읽으면 사용자에게는 버튼이 안 눌린 것으로 보인다
 * (POSTMORTEM 2026-09-06).
 */
it.each([["e", "unavailable"], ["link", "unavailable"]])("`?%s=`가 머리 Alert에 닿는다", async (key, value) => {
  const container = await screen({ [key]: value });
  const alert = container.querySelector('[role="alert"]');
  expect(alert).not.toBeNull();
  // 머리다 — 어느 구역에도 속하지 않는다.
  expect(alert!.closest("section")).toBeNull();
});

it("`?sessionRevocation=`는 Sessions 구역 안에 닿는다", async () => {
  const container = await screen({ sessionRevocation: "expired" });
  const alert = container.querySelector('[role="alert"]');
  expect(alert?.textContent).toContain(m.account.sessions.expired);
  const section = alert!.closest("section");
  expect(section).not.toBeNull();
  expect(section!.querySelector("h2")?.textContent).toBe(m.account.sessionsSection.title);
  // 구역 Alert는 헤더 아래·리스트 위다 — 리스트 안으로 들어가면 항목 하나처럼 읽힌다.
  expect(section!.querySelector("ul")!.compareDocumentPosition(alert!) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
});

/**
 * ⚠️ **사유 없는 `disabled`를 만들지 않는다** (POSTMORTEM 2026-09-06). 마지막 수단의 [Disconnect]와
 * 사진이 없을 때의 [Delete] 둘이 이 부류다.
 */
it("사유 없는 disabled가 0이다", async () => {
  const container = await screen({}, [{ provider: "github" }]);
  const disabled = [...container.querySelectorAll("button[disabled], input[disabled]")].filter((el) => !el.hasAttribute("aria-hidden"));
  expect(disabled.length).toBeGreaterThan(0);
  for (const control of disabled) {
    const reason = [...(control.parentElement?.children ?? [])]
      .filter((sibling) => sibling !== control)
      .map((sibling) => sibling.textContent ?? "")
      .join(" ");
    expect(reason.trim(), control.textContent ?? "").not.toBe("");
  }
});
