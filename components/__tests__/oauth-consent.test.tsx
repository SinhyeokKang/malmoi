// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConsentPanel } from "@/components/oauth/consent-panel";
import type { ScopeProject } from "@/components/mcp/token-grant-fields";

import { find, render } from "./helpers/dom";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), deny: vi.fn(), check: vi.fn(), switchAccount: vi.fn(), refresh: vi.fn() }));
vi.mock("@/app/oauth/authorize/actions", () => ({
  authorizeOAuthRequest: mocks.authorize,
  denyOAuthRequest: mocks.deny,
  checkOAuthRequest: mocks.check,
  switchOAuthAccount: mocks.switchAccount,
}));
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), useRouter: () => ({ refresh: mocks.refresh }) }));

/**
 * `/oauth/authorize` 동의 단계 (mcp-oauth 핸드오프 `1c`–`1j` · `1t`·`1u` · §8). 결과 셋 — 명시 거부는 입력 보존 + Alert(같은 버튼이 재시도),
 * 응답 유실은 성공으로도 실패로도 말하지 않고 `Check request` 하나, 성공은 Action의 redirect다. 폼은 토큰 발급 모달의 필드와 같은 어휘다.
 *
 * ⚠️ jsdom에는 focus fixup이 없다 — 포커스된 버튼이 `disabled`가 되면 브라우저는 `body`로 돌린다. `mcp-token.test.tsx`의 관용구를 쓴다.
 */
function installFocusFixup(): MutationObserver {
  const observer = new MutationObserver(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !active.matches(":disabled")) return;
    active.removeAttribute("disabled");
    active.blur();
    active.setAttribute("disabled", "");
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ["disabled"], subtree: true });
  return observer;
}

const PROJECTS: ScopeProject[] = [
  { id: "p1", name: "Web", repo: "acme/web" },
  { id: "p2", name: "Docs", repo: "acme/docs" },
];
const REDIRECT = () => Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/oauth/authorize?request=req_1&e=signed-out;307;" });

let fixup: MutationObserver;
beforeEach(() => { vi.clearAllMocks(); fixup = installFocusFixup(); });
afterEach(() => fixup.disconnect());

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mount(over: Partial<Parameters<typeof ConsentPanel>[0]> = {}) {
  await settle();
  const view = await render(
    <ConsentPanel
      requestId="req_1"
      app={{ name: "Claude Code", ident: "claude.ai/oauth/claude-code-client-metadata" }}
      returnTo="localhost:51234"
      account={{ email: "me@example.com", avatarName: "Me", image: null, secondary: "Signed in with GitHub" }}
      projects={PROJECTS}
      initial={{ grants: [], scope: "all", projectIds: [] }}
      replacesOn={null}
      {...over}
    />,
  );
  await settle();
  return view;
}
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === label) ?? null;
const click = async (el: Element | null) => { if (el === null) throw new Error("missing"); await userEvent.click(el as HTMLElement); await settle(); };
const status = () => find<HTMLElement>(document.body, "[data-consent-status]").textContent;
const fieldset = () => find<HTMLFieldSetElement>(document.body, "[data-consent-form]");

describe("기본", () => {
  it("권한은 한 열 · 만료 90 · All my projects · 돌아갈 곳 · 대체 경고 없음", async () => {
    await mount();
    expect(document.querySelector('[role="group"]')?.className).toContain("grid-cols-1");
    expect(document.querySelector('[data-scope="all"]')?.getAttribute("aria-checked")).toBe("true");
    expect(status()).toBe("You'll return to localhost:51234.");
    expect(document.body.textContent).not.toContain("replaces it");
    // 모달의 단계 문구가 새지 않는다(핸드오프 §7.6).
    expect(document.body.textContent).not.toContain("Step 1 of 2");
  });

  it("Authorize는 고른 값을 보낸다 — 성공은 Action의 redirect라 화면이 아무것도 단정하지 않는다", async () => {
    mocks.authorize.mockResolvedValue(undefined);
    await mount();
    await click(document.querySelector('[data-grant="member:manage"]'));
    await click(button("Authorize"));
    expect(mocks.authorize).toHaveBeenCalledWith({ requestId: "req_1", expiresInDays: 90, grants: ["member:manage"], scope: { kind: "all" } });
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(document.querySelector('[role="status"]')).toBeNull();
  });

  it("재동의 — 연결일 경고 + 기존 값", async () => {
    await mount({ replacesOn: "Sep 12, 2026", initial: { grants: ["translation:write"], scope: "projects", projectIds: ["p2"] } });
    expect(document.body.textContent).toContain("You connected this app on Sep 12, 2026.");
    expect(document.querySelector('[data-grant="translation:write"]')?.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector('[data-scope-project="p2"]')?.getAttribute("aria-checked")).toBe("true");
  });
});

describe("범위 입력", () => {
  it("Chosen projects 0개 — Authorize aria-disabled + 상태 슬롯 사유 · 눌러도 보내지 않는다", async () => {
    await mount();
    await click(document.querySelector('[data-scope="projects"]'));
    const authorize = button("Authorize")!;
    expect(authorize.getAttribute("aria-disabled")).toBe("true");
    expect(status()).toBe("Choose at least one project.");
    expect(authorize.getAttribute("aria-describedby")).toBe(find<HTMLElement>(document.body, "[data-consent-status]").id);
    await click(authorize);
    expect(mocks.authorize).not.toHaveBeenCalled();
    await click(document.querySelector('[data-scope-project="p1"]'));
    expect(button("Authorize")!.getAttribute("aria-disabled")).toBeNull();
  });

  it("멤버십 0 — Chosen projects가 aria-disabled + 사유", async () => {
    await mount({ projects: [] });
    expect(document.body.textContent).toContain("You're not a member of any project yet.");
  });
});

describe("제출 중 · 결과", () => {
  it("Authorize 제출 중 — 스피너 · Deny disabled · 폼 fieldset disabled · Not you? 막음", async () => {
    // ⚠️ 끝에서 푼다 — 안 끝나는 async transition은 뒤 테스트의 transition을 pending으로 붙잡는다(POSTMORTEM 2026-09-18).
    let finish!: (value: unknown) => void;
    mocks.authorize.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await mount();
    await click(button("Authorize"));
    expect(button("Authorize")!.disabled).toBe(true);
    expect(button("Authorize")!.querySelector("svg.animate-spin")).not.toBeNull();
    expect(button("Deny")!.disabled).toBe(true);
    expect(fieldset().disabled).toBe(true);
    expect(button("Not you?")!.disabled).toBe(true);
    await click(button("Authorize"));
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
    await act(async () => finish(undefined));
    await settle();
  });

  it("명시 거부 — danger Alert · 선택 보존 · Authorize가 그 Alert를 가리키고 포커스가 남는다 · 다시 누르면 재시도", async () => {
    mocks.authorize.mockResolvedValueOnce({ ok: false, reason: "unavailable" });
    await mount();
    await click(document.querySelector('[data-grant="project:settings"]'));
    await click(button("Authorize"));
    const alert = find<HTMLElement>(document.body, '[role="alert"]');
    expect(alert.textContent).toContain("We couldn't save this authorization. Your choices are kept — try again.");
    expect(document.querySelector('[data-grant="project:settings"]')?.getAttribute("aria-checked")).toBe("true");
    expect(button("Authorize")!.getAttribute("aria-describedby")).toBe(alert.parentElement!.id);
    expect(document.activeElement).toBe(button("Authorize"));
    mocks.authorize.mockResolvedValueOnce(undefined);
    await click(button("Authorize"));
    expect(mocks.authorize).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it("Deny 제출 중 · 명시 실패 — 같은 자리 · Deny가 Alert를 가리킨다 (`1t`·`1u`)", async () => {
    let fail!: (value: unknown) => void;
    mocks.deny.mockReturnValueOnce(new Promise((resolve) => { fail = resolve; }));
    await mount();
    await click(button("Deny"));
    expect(button("Deny")!.disabled).toBe(true);
    expect(button("Authorize")!.disabled).toBe(true);
    await act(async () => fail({ ok: false, reason: "unavailable" }));
    await settle();
    const alert = find<HTMLElement>(document.body, '[role="alert"]');
    expect(alert.textContent).toContain("We couldn't record your answer. Nothing changed — try again.");
    expect(button("Deny")!.getAttribute("aria-describedby")).toBe(alert.parentElement!.id);
    expect(mocks.deny).toHaveBeenCalledWith("req_1");
  });

  it("응답 유실 — 미확인 status · Deny·Authorize 대신 Check request 하나 · 포커스는 Check request · 자동 재시도 없음", async () => {
    mocks.authorize.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await mount();
    await click(button("Authorize"));
    expect(find<HTMLElement>(document.body, '[role="status"]').textContent).toContain("We couldn't confirm whether this went through.");
    expect(button("Authorize")).toBeNull();
    expect(button("Deny")).toBeNull();
    expect(document.activeElement).toBe(button("Check request"));
    expect(fieldset().disabled).toBe(true);
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
  });

  it("Check request → 대기면 폼으로 돌아간다(선택 보존 · Alert 치움 · 포커스 Authorize)", async () => {
    mocks.authorize.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    mocks.check.mockResolvedValueOnce({ status: "pending" });
    await mount();
    await click(document.querySelector('[data-grant="member:manage"]'));
    await click(button("Authorize"));
    await click(button("Check request"));
    expect(mocks.check).toHaveBeenCalledWith("req_1");
    expect(document.querySelector('[role="status"]')).toBeNull();
    expect(document.activeElement).toBe(button("Authorize"));
    expect(document.querySelector('[data-grant="member:manage"]')?.getAttribute("aria-checked")).toBe("true");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("Check request → 끝났으면 서버가 종료 화면을 그린다(refresh) · 조회가 또 끊기면 미확인에 머문다", async () => {
    mocks.deny.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    mocks.check.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce({ status: "ended" });
    await mount();
    await click(button("Deny"));
    await click(button("Check request"));
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(button("Check request")).not.toBeNull();
    await click(button("Check request"));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("세션 만료의 redirect는 되던진다 — 미확인·실패 Alert를 세우지 않는다", async () => {
    mocks.authorize.mockRejectedValueOnce(REDIRECT());
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await mount();
    await click(button("Authorize")).catch(() => {});
    errors.mockRestore();
    expect(document.body.textContent).not.toContain("We couldn't confirm");
    expect(document.body.textContent).not.toContain("We couldn't save");
  });
});

describe("Not you?", () => {
  it("같은 요청 ID로 계정 전환 Action을 부른다", async () => {
    await mount();
    await click(button("Not you?"));
    expect(mocks.switchAccount).toHaveBeenCalledWith("req_1");
  });
});
