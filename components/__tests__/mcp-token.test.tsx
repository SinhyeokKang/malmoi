// @vitest-environment jsdom
import { act, Component, type ReactNode } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TokenCard, type TokenCardData } from "@/components/mcp/token-card";
import { EXPIRY, GRANT_ORDER, type ScopeProject } from "@/components/mcp/token-grant-fields";
import { m } from "@/lib/i18n";
import { TOKEN_GRANTS } from "@/lib/mcp/grant";
import { API_TOKEN_EXPIRY_DAYS } from "@/lib/mcp/issue-plan";

import { find, render } from "./helpers/dom";

const mocks = vi.hoisted(() => ({ issue: vi.fn(), revoke: vi.fn(), refresh: vi.fn(), rethrown: [] as unknown[] }));
vi.mock("@/app/(edit)/mcp/actions", () => ({ issueApiToken: mocks.issue, revokeApiToken: mocks.revoke }));
vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    useRouter: () => ({ refresh: mocks.refresh }),
    // 실물을 그대로 부르고, 되던진 것만 기록한다 — 호출부가 redirect를 삼키지 않았는지를 경계 렌더와 별개로 잰다.
    unstable_rethrow: (thrown: unknown) => {
      try { actual.unstable_rethrow(thrown); } catch (error) { mocks.rethrown.push(error); throw error; }
    },
  };
});

/** `requireUser`의 redirect — Server Action 호출부에서는 reject로 온다(`action-throws.test.tsx`와 같은 모양). */
const REDIRECT = () => Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/signin;307;" });
class Boundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) { return { error }; }
  render() { return this.state.error === null ? this.props.children : <p data-caught>{String((this.state.error as { digest?: string }).digest)}</p>; }
}

/**
 * `/mcp` 토큰 카드·모달 (mcp-connector T8 · 핸드오프 `1a`–`4b`). 서버 확인 전에는 성공으로 보이지 않고, 응답을 잃으면 **자동 재시도 없이**
 * 카드가 복구를 말한다. 원문은 ②에서 한 번만 보이고 복사 성공만으로 닫히지 않는다.
 *
 * ⚠️ **jsdom에는 HTML의 focus fixup 규칙이 없다** — 포커스된 버튼이 `disabled`가 되면 브라우저는 `body`로 돌리지만 jsdom은 그대로
 * 둔다. 그러면 착지 로직을 지워도 green이다(POSTMORTEM 2026-09-20). `invite-modal.test.tsx`의 관용구를 그대로 가져온다.
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

const NOW = "2026-09-28T12:00:00.000Z";
const RAW = "mlm_" + "q".repeat(43);
const PROJECTS: ScopeProject[] = [
  { id: "p1", name: "Web", repo: "acme/web" },
  { id: "p2", name: "Docs", repo: "acme/docs" },
];
const ACTIVE: TokenCardData = {
  state: "active",
  grants: ["translation:write", "member:manage"],
  scope: { kind: "all" },
  createdAt: "2026-09-28T00:00:00.000Z",
  lastUsedAt: null,
  expiresAt: "2026-12-27T12:00:00.000Z",
};

let fixup: MutationObserver;
let clipboard: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rethrown.length = 0;
  fixup = installFocusFixup();
  clipboard = vi.fn(async () => {});
  Object.defineProperty(navigator, "clipboard", { value: { writeText: clipboard }, configurable: true });
});
afterEach(() => fixup.disconnect());

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mount(token: TokenCardData, projects: ScopeProject[] = PROJECTS, boundary = false) {
  await settle();
  const ui = <TokenCard token={token} projects={projects} now={NOW} />;
  const view = await render(boundary ? <Boundary>{ui}</Boundary> : ui);
  await settle();
  return { ...view, update: (next: TokenCardData) => view.rerender(<TokenCard token={next} projects={projects} now={NOW} />) };
}
const card = () => find<HTMLElement>(document.body, "section");
const button = (root: ParentNode, label: string) => [...root.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === label) ?? null;
const panel = () => document.querySelector<HTMLElement>("[data-onboarding-panel]");
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]:not([data-onboarding-panel])');
const live = () => find<HTMLElement>(document.body, "[data-token-live]");
const click = async (el: Element | null) => { if (el === null) throw new Error("missing"); await userEvent.click(el as HTMLElement); await settle(); };
const facts = () => Object.fromEntries([...card().querySelectorAll("dt")].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]));

describe("어휘 두 벌이 서버와 같다", () => {
  it("GRANT_ORDER = TOKEN_GRANTS · EXPIRY = API_TOKEN_EXPIRY_DAYS", () => {
    expect([...GRANT_ORDER]).toEqual([...TOKEN_GRANTS]);
    expect([...EXPIRY]).toEqual([...API_TOKEN_EXPIRY_DAYS]);
  });
});

describe("카드 상태 셋", () => {
  it("1a 없음 — 머리 Create token · 빈 상태에 버튼 없음 · status는 항상 DOM에 있다", async () => {
    await mount({ state: "none" });
    expect(button(card(), m.mcpConnector.token.create)).not.toBeNull();
    expect(button(card(), m.mcpConnector.token.rotate)).toBeNull();
    expect(card().textContent).toContain(m.mcpConnector.token.emptyTitle);
    // 빈 상태 칸의 글리프는 공식 MCP 로고다(2026-09-29 — 옛 lucide `Plug`) — 단색 `currentColor` · 낭독 제외.
    const glyph = find<SVGSVGElement>(card(), "svg path[d^='M13.85 0a4.16']").ownerSVGElement;
    expect(glyph?.getAttribute("fill")).toBe("currentColor");
    expect(glyph?.getAttribute("aria-hidden")).toBe("true");
    expect(card().querySelectorAll("button")).toHaveLength(1);
    expect(live().getAttribute("role")).toBe("status");
    expect(live().textContent).toBe("");
  });

  it("1b 활성 — Rotate · Revoke, primary 없음, 사실 다섯", async () => {
    await mount(ACTIVE);
    expect(button(card(), m.mcpConnector.token.rotate)).not.toBeNull();
    expect(button(card(), m.mcpConnector.token.revoke)).not.toBeNull();
    expect(button(card(), m.mcpConnector.token.create)).toBeNull();
    expect(facts()).toEqual({
      // 권한마다 배지 하나라 textContent가 이어 붙는다 — 배지 개수는 `grant-badges`를 보는 쪽이 센다.
      [m.mcpConnector.token.facts.grants]: "Translate & publishMembers",
      [m.mcpConnector.token.facts.scope]: m.mcpConnector.token.allProjects,
      [m.mcpConnector.token.facts.created]: "Sep 28, 2026",
      [m.mcpConnector.token.facts.lastUsed]: m.mcpConnector.token.never,
      [m.mcpConnector.token.facts.expires]: "in 90 days",
    });
    expect(card().querySelector("h2 + span")).toBeNull();
  });

  it("빈 grant는 Read only · 범위는 개수", async () => {
    await mount({ ...ACTIVE, grants: [], scope: { kind: "projects", projectIds: ["p1", "p2"] } });
    expect(facts()[m.mcpConnector.token.facts.grants]).toBe(m.mcpConnector.token.readOnly);
    expect(facts()[m.mcpConnector.token.facts.scope]).toBe("2 projects");
  });

  it("1c 만료 — h2 바로 뒤 Expired 배지 · Create token만 · 값이 흐리고 날짜는 절대값", async () => {
    await mount({ ...ACTIVE, state: "expired", expiresAt: "2026-09-01T00:00:00.000Z", lastUsedAt: "2026-08-30T00:00:00.000Z" });
    expect(find<HTMLElement>(card(), "h2 + span").textContent).toBe(m.mcpConnector.token.expired);
    expect(button(card(), m.mcpConnector.token.create)).not.toBeNull();
    expect(button(card(), m.mcpConnector.token.rotate)).toBeNull();
    expect(facts()[m.mcpConnector.token.facts.expires]).toBe("Sep 1, 2026");
    expect(facts()[m.mcpConnector.token.facts.lastUsed]).toBe("Aug 30, 2026");
    for (const dd of card().querySelectorAll("dd")) expect(dd.className).toContain("text-gray-dim");
  });
});

describe("생성 ① → ②", () => {
  it("기본값으로 보내고 ②에서 원문을 한 번 보인다 · 서버 확인 뒤에만 완료를 알린다", async () => {
    let resolve: (value: unknown) => void = () => {};
    mocks.issue.mockReturnValue(new Promise((r) => { resolve = r; }));
    await mount({ state: "none" });
    await click(button(card(), m.mcpConnector.token.create));
    expect(panel()?.textContent).toContain(m.mcpConnector.form.createTitle);
    expect(panel()?.textContent).toContain(m.mcpConnector.form.step(1));
    await click(button(panel()!, m.mcpConnector.form.create));
    expect(mocks.issue).toHaveBeenCalledWith({ expiresInDays: 90, grants: [], scope: { kind: "all" } });
    // 서버 확인 전 — 성공으로 보이지 않는다.
    expect(live().textContent).toBe("");
    expect(panel()?.querySelector("[data-secret-field]")).toBeNull();
    await act(async () => resolve({ ok: true, token: RAW, expiresAt: "2026-12-27T12:00:00.000Z" }));
    await settle();
    expect(find<HTMLInputElement>(panel()!, "[data-secret-field]").value).toBe(RAW);
    expect(panel()?.textContent).toContain(m.mcpConnector.result.copyNow);
    expect(live().textContent).toBe(m.mcpConnector.token.status.created);
    expect(button(panel()!, m.newProject.modal.back)).toBeNull();
  });

  it("복사 성공만으로 닫히지 않는다 · Done → 활성 카드의 Rotate로 착지", async () => {
    mocks.issue.mockResolvedValue({ ok: true, token: RAW, expiresAt: ACTIVE.expiresAt });
    const view = await mount({ state: "none" });
    await click(button(card(), m.mcpConnector.token.create));
    await click(button(panel()!, m.mcpConnector.form.create));
    await click(button(panel()!, m.common.copy));
    expect(clipboard).toHaveBeenCalledWith(RAW);
    expect(button(panel()!, m.common.copied)).not.toBeNull();
    expect(panel()).not.toBeNull();
    // 뒤 페이지는 Action의 재검증으로 이미 활성이다.
    await view.update(ACTIVE);
    await click(button(panel()!, m.mcpConnector.result.done));
    await settle();
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(button(card(), m.mcpConnector.token.rotate));
  });

  it("클립보드 거부 — Copy failed 라벨 · 원문 유지 · 모달 유지", async () => {
    clipboard.mockRejectedValue(new Error("denied"));
    mocks.issue.mockResolvedValue({ ok: true, token: RAW, expiresAt: ACTIVE.expiresAt });
    await mount({ state: "none" });
    await click(button(card(), m.mcpConnector.token.create));
    await click(button(panel()!, m.mcpConnector.form.create));
    await click(button(panel()!, m.common.copy));
    expect(button(panel()!, m.common.copyFailed)).not.toBeNull();
    expect(find<HTMLInputElement>(panel()!, "[data-secret-field]").value).toBe(RAW);
    expect(find<HTMLElement>(panel()!, "[data-secret-field]").className).toContain("select-all");
  });

  it("4a 거부 — danger Alert · 입력 유지 · 같은 버튼이 재시도 · 포커스는 확정 버튼", async () => {
    mocks.issue.mockResolvedValue({ ok: false, reason: "unavailable" });
    await mount({ state: "none" });
    await click(button(card(), m.mcpConnector.token.create));
    await click(find(panel()!, '[data-grant="member:manage"]'));
    const submit = button(panel()!, m.mcpConnector.form.create)!;
    await click(submit);
    expect(find<HTMLElement>(panel()!, '[role="alert"]').textContent).toBe(m.mcpConnector.form.failed);
    expect(find<HTMLElement>(panel()!, '[data-grant="member:manage"]').getAttribute("data-state")).toBe("checked");
    expect(document.activeElement).toBe(submit);
    expect(live().textContent).toBe("");
    await click(submit);
    expect(mocks.issue).toHaveBeenCalledTimes(2);
  });

  it("4b 응답 유실 — 모달을 닫고 카드가 복구를 말한다 · 자동 재시도 없음 · 온라인이면 refresh", async () => {
    mocks.issue.mockRejectedValue(new Error("network"));
    await mount({ state: "none" });
    await click(button(card(), m.mcpConnector.token.create));
    await click(button(panel()!, m.mcpConnector.form.create));
    await settle();
    expect(panel()).toBeNull();
    expect(card().textContent).toContain(m.mcpConnector.token.unconfirmed);
    expect(mocks.issue).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    // 문장은 항상 DOM에 있는 status 영역이 읽는다 — 조건부로 끼워 넣는 live 영역을 따로 세우지 않는다.
    expect(live().textContent).toBe(m.mcpConnector.token.unconfirmed);
    expect(card().querySelectorAll('[role="status"]')).toHaveLength(1);
  });

  it("② 원문 화면은 Esc · 바깥 클릭 · X로 닫히지 않는다 — Done이 유일한 출구다", async () => {
    mocks.issue.mockResolvedValue({ ok: true, token: RAW, expiresAt: ACTIVE.expiresAt });
    await mount({ state: "none" });
    await click(button(card(), m.mcpConnector.token.create));
    await click(button(panel()!, m.mcpConnector.form.create));
    await userEvent.keyboard("{Escape}");
    await settle();
    expect(panel()).not.toBeNull();
    const overlay = [...document.querySelectorAll<HTMLElement>("[data-state]")].find((el) => el.className.includes("bg-foreground/32"));
    if (overlay !== undefined) {
      await act(async () => {
        overlay.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
        overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await settle();
    }
    expect(panel()).not.toBeNull();
    const close = find<HTMLButtonElement>(panel()!, `button[aria-label="${m.common.close}"]`);
    expect(close.disabled).toBe(true);
    expect(find<HTMLInputElement>(panel()!, "[data-secret-field]").value).toBe(RAW);
    await click(button(panel()!, m.mcpConnector.result.done));
    expect(panel()).toBeNull();
  });

  it("① 폼은 Esc로 닫힌다 — 잠금은 ②만이다", async () => {
    await mount({ state: "none" });
    await click(button(card(), m.mcpConnector.token.create));
    await userEvent.keyboard("{Escape}");
    await settle();
    expect(panel()).toBeNull();
  });

  it("세션 만료(redirect reject) — 되던져 Next가 로그인으로 보낸다 · 미확인 Alert·재시도 없음", async () => {
    mocks.issue.mockRejectedValue(REDIRECT());
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await mount({ state: "none" }, PROJECTS, true);
    await click(button(document.body, m.mcpConnector.token.create));
    await click(button(panel()!, m.mcpConnector.form.create));
    await settle();
    error.mockRestore();
    expect(document.querySelector("[data-caught]")?.textContent).toContain("NEXT_REDIRECT");
    expect(mocks.rethrown).toHaveLength(1);
    expect(document.body.textContent).not.toContain(m.mcpConnector.token.unconfirmed);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.issue).toHaveBeenCalledTimes(1);
  });

  it("응답이 값 없이 끝나도(undefined) TypeError도 미확인도 없다 — 모달이 그대로 선다", async () => {
    mocks.issue.mockResolvedValue(undefined);
    await mount({ state: "none" });
    await click(button(card(), m.mcpConnector.token.create));
    await click(button(panel()!, m.mcpConnector.form.create));
    await settle();
    expect(panel()).not.toBeNull();
    expect(card().textContent).not.toContain(m.mcpConnector.token.unconfirmed);
    expect(live().textContent).toBe("");
  });

  it("세션 만료(응답이 오지 않는 redirect) — 중복 발급 없음 · 입력 유지 · 진행 표시", async () => {
    mocks.issue.mockReturnValue(new Promise(() => {}));
    await mount({ state: "none" });
    await click(button(card(), m.mcpConnector.token.create));
    await click(find(panel()!, '[data-grant="translation:write"]'));
    const submit = button(panel()!, m.mcpConnector.form.create)!;
    await click(submit);
    await click(submit);
    expect(mocks.issue).toHaveBeenCalledTimes(1);
    expect(submit.getAttribute("aria-busy") === "true" || submit.disabled).toBe(true);
    expect(find<HTMLElement>(panel()!, '[data-grant="translation:write"]').getAttribute("data-state")).toBe("checked");
  });

  it("모달 취소 → 누른 Create token으로 돌아간다", async () => {
    await mount({ state: "none" });
    const create = button(card(), m.mcpConnector.token.create)!;
    await click(create);
    await click(button(panel()!, m.common.cancel));
    await settle();
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(create);
  });
});

describe("범위", () => {
  it("2e Chosen projects — 0개면 Create 꺼짐 + 바닥 사유 · 고르면 보낸다", async () => {
    mocks.issue.mockResolvedValue({ ok: true, token: RAW, expiresAt: ACTIVE.expiresAt });
    await mount({ state: "none" });
    await click(button(card(), m.mcpConnector.token.create));
    await click(find(panel()!, '[data-scope="projects"]'));
    expect(button(panel()!, m.mcpConnector.form.create)!.disabled).toBe(true);
    expect(find<HTMLElement>(panel()!, "[data-token-status]").textContent).toBe(m.mcpConnector.form.chooseOne);
    await click(find(panel()!, '[data-scope-project="p2"]'));
    await click(button(panel()!, m.mcpConnector.form.create));
    expect(mocks.issue).toHaveBeenCalledWith({ expiresInDays: 90, grants: [], scope: { kind: "projects", projectIds: ["p2"] } });
  });

  it("2b 멤버십 0 — Chosen projects가 aria-disabled + 사유", async () => {
    await mount({ state: "none" }, []);
    await click(button(card(), m.mcpConnector.token.create));
    const row = find<HTMLElement>(panel()!, '[role="radio"][aria-disabled="true"]');
    expect(document.getElementById(row.getAttribute("aria-describedby") ?? "")?.textContent).toBe(m.mcpConnector.form.noMembership);
    expect(row.hasAttribute("disabled")).toBe(false);
  });
});

describe("회전", () => {
  it("2d — warning Alert · 현재 허용 동작·범위로 채움 · 만료 기본 90 · 확정 라벨", async () => {
    mocks.issue.mockResolvedValue({ ok: true, token: RAW, expiresAt: ACTIVE.expiresAt });
    await mount({ ...ACTIVE, scope: { kind: "projects", projectIds: ["p1"] } });
    await click(button(card(), m.mcpConnector.token.rotate));
    expect(panel()?.textContent).toContain(m.mcpConnector.form.rotateWarning);
    await click(button(panel()!, m.mcpConnector.form.rotateConfirm));
    expect(mocks.issue).toHaveBeenCalledWith({ expiresInDays: 90, grants: ["translation:write", "member:manage"], scope: { kind: "projects", projectIds: ["p1"] } });
    expect(live().textContent).toBe(m.mcpConnector.token.status.rotated);
  });
});

describe("폐기", () => {
  it("3a 취소 → Revoke로 돌아간다", async () => {
    await mount(ACTIVE);
    const revoke = button(card(), m.mcpConnector.token.revoke)!;
    await click(revoke);
    expect(dialog()?.textContent).toContain(m.mcpConnector.revoke.title);
    await click(button(dialog()!, m.common.cancel));
    await settle();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(revoke);
  });

  it("3a 확정 → 완료 알림 · 카드가 없음으로 바뀐 뒤 Create token에 착지", async () => {
    mocks.revoke.mockResolvedValue({ ok: true });
    const view = await mount(ACTIVE);
    await click(button(card(), m.mcpConnector.token.revoke));
    await click(button(dialog()!, m.mcpConnector.revoke.confirm));
    await settle();
    expect(dialog()).toBeNull();
    expect(live().textContent).toBe(m.mcpConnector.token.status.revoked);
    await view.update({ state: "none" });
    await settle();
    expect(document.activeElement).toBe(button(card(), m.mcpConnector.token.create));
  });

  it("거부 → Dialog 안 danger Alert, 닫히지 않는다", async () => {
    mocks.revoke.mockResolvedValue({ ok: false, reason: "unavailable" });
    await mount(ACTIVE);
    await click(button(card(), m.mcpConnector.token.revoke));
    await click(button(dialog()!, m.mcpConnector.revoke.confirm));
    expect(find<HTMLElement>(dialog()!, '[role="alert"]').textContent).toBe(m.errors.access.unavailable);
    expect(live().textContent).toBe("");
  });

  it("세션 만료(redirect reject) — 되던진다 · 미확인 Alert 없음", async () => {
    mocks.revoke.mockRejectedValue(REDIRECT());
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await mount(ACTIVE, PROJECTS, true);
    await click(button(document.body, m.mcpConnector.token.revoke));
    await click(button(dialog()!, m.mcpConnector.revoke.confirm));
    await settle();
    await settle();
    error.mockRestore();
    // ⚠️ Radix Dialog 안에서 시작한 transition의 throw는 jsdom에서 경계 렌더까지 안 닿는다 — 되던졌는지를 직접 잰다.
    expect(mocks.rethrown).toHaveLength(1);
    expect(String((mocks.rethrown[0] as { digest?: string }).digest)).toContain("NEXT_REDIRECT");
    expect(document.body.textContent).not.toContain(m.mcpConnector.token.revokeUnconfirmed);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("폐기 응답이 값 없이 끝나도 TypeError가 없다", async () => {
    mocks.revoke.mockResolvedValue(undefined);
    await mount(ACTIVE);
    await click(button(card(), m.mcpConnector.token.revoke));
    await click(button(dialog()!, m.mcpConnector.revoke.confirm));
    await settle();
    expect(card().textContent).not.toContain(m.mcpConnector.token.revokeUnconfirmed);
    expect(live().textContent).toBe("");
  });

  it("응답 유실 → 닫고 카드가 말한다 · 재시도 없음 · refresh", async () => {
    mocks.revoke.mockRejectedValue(new Error("network"));
    await mount(ACTIVE);
    await click(button(card(), m.mcpConnector.token.revoke));
    await click(button(dialog()!, m.mcpConnector.revoke.confirm));
    await settle();
    expect(dialog()).toBeNull();
    expect(card().textContent).toContain(m.mcpConnector.token.revokeUnconfirmed);
    expect(mocks.revoke).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    // Alert 다음 사실 블록은 행↔행 선이다(4b).
    expect(find<HTMLElement>(card(), "[data-token-facts]").classList.contains("border-t")).toBe(false);
    expect(card().querySelector("[data-card-notice]")?.className).toContain("border-divider border-b");
  });
});
