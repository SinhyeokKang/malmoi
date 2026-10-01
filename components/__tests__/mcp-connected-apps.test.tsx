// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConnectedAppsCard, type ConnectedAppData } from "@/components/mcp/connected-apps-card";

import { m } from "@/lib/i18n";

import { find, render } from "./helpers/dom";

const mocks = vi.hoisted(() => ({ disconnect: vi.fn(), refresh: vi.fn() }));
vi.mock("@/app/(edit)/mcp/actions", () => ({ disconnectOAuthConnection: mocks.disconnect }));
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), useRouter: () => ({ refresh: mocks.refresh }) }));

/**
 * `/mcp` Connected apps (mcp-oauth 핸드오프 §7.3 · §7.5 · `2a`–`2i` · spec 조건 8). 개인 토큰 폐기와 같은 패턴 — 확인 · 명시 실패는 Dialog 안 ·
 * 결과 미확인은 성공으로 말하지 않고 재조회 · 끊은 뒤 포커스는 다음 행 → 이전 행 → 카드 제목. 조회 장애는 연결 없음과 구별한다.
 *
 * ⚠️ jsdom에는 focus fixup이 없다 — `mcp-token.test.tsx`의 관용구를 쓴다.
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

const NOW = "2026-09-29T12:00:00.000Z";
const SERVER_URL = "https://mal-moi.com/api/mcp";
const app = (over: Partial<ConnectedAppData>): ConnectedAppData => ({
  id: "c1",
  name: "Claude Code",
  ident: "claude.ai/oauth/claude-code-client-metadata",
  state: "active",
  grants: ["translation:write", "project:settings"],
  scope: { kind: "all" },
  createdAt: "2026-09-01T00:00:00.000Z",
  lastUsedAt: "2026-09-29T11:48:00.000Z",
  expiresAt: "2026-12-26T12:00:00.000Z",
  brand: "claude",
  ...over,
});
const APPS = [
  app({}),
  app({ id: "c2", name: "Claude", ident: "claude.ai/oauth/mcp-client-metadata", grants: [], scope: { kind: "projects", projectIds: ["p1", "p2"] }, lastUsedAt: null }),
  app({ id: "c3", name: "Claude", ident: "chatgpt.com/oauth/codex/x/client.json", grants: ["translation:write"], scope: { kind: "projects", projectIds: ["p1"] }, brand: "openai" }),
];

let fixup: MutationObserver;
beforeEach(() => { vi.clearAllMocks(); fixup = installFocusFixup(); });
afterEach(() => fixup.disconnect());

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mount(apps: ConnectedAppData[] | null) {
  await settle();
  const view = await render(<ConnectedAppsCard apps={apps} now={NOW} serverUrl={SERVER_URL} />);
  await settle();
  return view;
}
const card = () => find<HTMLElement>(document.body, "section");
const rowButton = (id: string) => document.querySelector<HTMLButtonElement>(`[data-app-disconnect="${id}"]`);
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const button = (root: ParentNode, label: string) => [...root.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === label) ?? null;
const click = async (el: Element | null) => { if (el === null) throw new Error("missing"); await userEvent.click(el as HTMLElement); await settle(); };
const live = () => find<HTMLElement>(document.body, "[data-apps-live]");
const heading = () => find<HTMLElement>(document.body, "#mcp-apps-title");

describe("목록", () => {
  it("행마다 이름 · 식별 줄 · 사실 넷 · Disconnect — 카운트 배지", async () => {
    await mount(APPS);
    expect(card().querySelectorAll("[data-app-row]")).toHaveLength(3);
    expect(card().querySelector("h2 + span")?.textContent).toContain("3");
    // 숫자는 aria-hidden이고 sr 문장은 연결 수다 — 카드 제목을 되읽지 않는다(U3 r1).
    expect(card().querySelector("h2 + span")?.querySelector(".sr-only")?.textContent).toBe(m.mcpConnector.apps.count(3));
    const first = find<HTMLElement>(card(), '[data-app-row="c1"]');
    expect(first.textContent).toContain("claude.ai/oauth/claude-code-client-metadata");
    // 권한마다 배지 하나다(2026-09-30 사용자).
    expect([...first.querySelectorAll("dd .rounded-full")].map((b) => b.textContent)).toEqual(expect.arrayContaining(["Translate & publish", "Project settings"]));
    expect(first.textContent).toContain("All projects");
    expect(first.textContent).toContain("12 minutes ago");
    const second = find<HTMLElement>(card(), '[data-app-row="c2"]');
    expect(second.textContent).toContain("Read only");
    expect(second.textContent).toContain("2 projects");
    expect(second.textContent).toContain("Never");
  });

  /**
   * 목록은 이웃 카드와 같은 `RowCardList`/`RowCardItem`이다(design-sync 리뷰) — 손으로 적으면 행 선 규칙이 바뀔 때 이 카드만 남고,
   * 목록의 접근 이름(카드 제목)이 빠진다.
   */
  it("목록은 카드 제목으로 이름 붙은 RowCardList다 — 선은 머리↔첫 행이 약하고 행↔행이 진하다", async () => {
    await mount(APPS);
    const list = find<HTMLElement>(card(), "ul");
    expect(list.getAttribute("aria-labelledby")).toBe(heading().id);
    const items = [...list.children] as HTMLElement[];
    expect(items.map((li) => li.tagName)).toEqual(["LI", "LI", "LI"]);
    expect(items[0]!.className).toContain("border-foreground/[0.06]");
    expect(items[1]!.className).toContain("border-border");
  });

  it("같은 이름의 두 연결은 끊기 버튼의 접근 이름이 다르다", async () => {
    await mount(APPS);
    expect(rowButton("c2")?.getAttribute("aria-label")).toBe("Disconnect Claude, claude.ai/oauth/mcp-client-metadata");
    expect(rowButton("c3")?.getAttribute("aria-label")).toBe("Disconnect Claude, chatgpt.com/oauth/codex/x/client.json");
  });

  it("긴 이름·주소는 말줄임하지 않고 줄바꿈한다", async () => {
    await mount([app({ name: "Acme Localization Assistant for Enterprise Translation Workflows (Staging)", ident: "tools.acme-internal.example.com/mcp/clients/localization-assistant/client-metadata.json" })]);
    const row = find<HTMLElement>(card(), "[data-app-row]");
    expect(row.innerHTML).not.toContain("truncate");
    expect(row.textContent).toContain("localization-assistant/client-metadata.json");
  });

  it("만료 행 — Expired 배지 · 절대 날짜 · Disconnect는 남는다", async () => {
    await mount([app({ state: "expired", lastUsedAt: "2026-08-30T10:00:00.000Z", expiresAt: "2026-09-01T00:00:00.000Z" })]);
    const row = find<HTMLElement>(card(), "[data-app-row]");
    expect(row.textContent).toContain("Expired");
    expect(row.textContent).toContain("Aug 30, 2026");
    expect(row.textContent).toContain("Sep 1, 2026");
    expect(rowButton("c1")).not.toBeNull();
  });

  it("빈 목록 — 빈 상태 · 머리의 복사 버튼만 · 카운트 없음", async () => {
    await mount([]);
    expect(card().textContent).toContain("No connected apps");
    expect(card().querySelector("h2 + span")).toBeNull();
    expect([...card().querySelectorAll("button")].map((b) => b.textContent?.trim())).toEqual(["Copy server URL"]);
  });

  it("조회 장애 — 빈 상태가 아니다 · danger 행 + Try again(재조회) · 카운트 없음", async () => {
    await mount(null);
    const failed = find<HTMLElement>(card(), "[data-apps-failed]");
    // 카드에 붙는 실패는 `Alert inset danger`다(ux-drift-unify 5-Y10) — 손 조립 행은 글자 전체가 빨갰다(§6.2 "Alert는 글자를 본문 색으로").
    const alert = find<HTMLElement>(failed, '[data-alert="danger"]');
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.className).not.toContain("text-destructive");
    expect(failed.textContent).toContain("We couldn't load your connected apps.");
    expect(card().textContent).not.toContain("No connected apps");
    expect(card().querySelector("h2 + span")).toBeNull();
    await click(button(failed, "Try again"));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
});

describe("끊기", () => {
  it("확인 Dialog — 제목에 이름 · 본문에 식별 줄 · 초기 포커스 Cancel · 취소하면 누른 행으로", async () => {
    await mount(APPS);
    await click(rowButton("c2"));
    expect(dialog()?.textContent).toContain("Disconnect Claude?");
    expect(find<HTMLElement>(dialog()!, "[data-disconnect-app]").textContent).toContain("claude.ai/oauth/mcp-client-metadata");
    expect(document.activeElement?.textContent?.trim()).toBe("Cancel");
    await click(button(dialog()!, "Cancel"));
    expect(dialog()).toBeNull();
    expect(mocks.disconnect).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(rowButton("c2"));
  });

  it("성공 — 행이 사라지고 status가 말한다 · 포커스는 다음 행의 Disconnect", async () => {
    mocks.disconnect.mockResolvedValue({ ok: true });
    await mount(APPS);
    await click(rowButton("c2"));
    await click(dialog()!.querySelector("[data-disconnect-confirm]"));
    expect(mocks.disconnect).toHaveBeenCalledWith("c2");
    expect(dialog()).toBeNull();
    expect(rowButton("c2")).toBeNull();
    expect(live().textContent).toBe("Disconnected Claude");
    expect(document.activeElement).toBe(rowButton("c3"));
  });

  it("마지막 행을 끊으면 이전 행으로 · 하나뿐이면 카드 제목으로", async () => {
    mocks.disconnect.mockResolvedValue({ ok: true });
    await mount(APPS);
    await click(rowButton("c3"));
    await click(dialog()!.querySelector("[data-disconnect-confirm]"));
    expect(document.activeElement).toBe(rowButton("c2"));
  });

  it("하나뿐인 행을 끊으면 카드 제목으로", async () => {
    mocks.disconnect.mockResolvedValue({ ok: true });
    await mount([app({})]);
    await click(rowButton("c1"));
    await click(dialog()!.querySelector("[data-disconnect-confirm]"));
    expect(document.activeElement).toBe(heading());
  });

  it("명시 실패 — Dialog 안 danger Alert · 닫히지 않는다 · 행이 남는다 · 포커스는 확정 버튼(재시도 자리)", async () => {
    mocks.disconnect.mockResolvedValue({ ok: false, reason: "unavailable" });
    await mount(APPS);
    await click(rowButton("c1"));
    await click(dialog()!.querySelector("[data-disconnect-confirm]"));
    expect(dialog()).not.toBeNull();
    expect(document.activeElement).toBe(dialog()!.querySelector("[data-disconnect-confirm]"));
    expect(find<HTMLElement>(dialog()!, '[role="alert"]').textContent).toBeTruthy();
    expect(rowButton("c1")).not.toBeNull();
  });

  it("제출 중 — 확정 스피너 · Cancel disabled · Esc로 닫히지 않는다", async () => {
    // ⚠️ 끝에서 푼다 — 안 끝나는 async transition은 뒤 테스트의 transition을 pending으로 붙잡는다(POSTMORTEM 2026-09-18).
    let finish!: (value: unknown) => void;
    mocks.disconnect.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await mount(APPS);
    await click(rowButton("c1"));
    await click(dialog()!.querySelector("[data-disconnect-confirm]"));
    expect(button(dialog()!, "Cancel")?.disabled).toBe(true);
    await userEvent.keyboard("{Escape}");
    await settle();
    expect(dialog()).not.toBeNull();
    await act(async () => finish({ ok: true }));
    await settle();
  });

  it("응답 유실 — 성공으로 말하지 않는다 · 닫고 카드가 말한다 · 재조회 · 포커스는 카드 제목 · 행은 남는다", async () => {
    mocks.disconnect.mockRejectedValue(new TypeError("Failed to fetch"));
    await mount(APPS);
    await click(rowButton("c1"));
    await click(dialog()!.querySelector("[data-disconnect-confirm]"));
    expect(dialog()).toBeNull();
    expect(card().textContent).toContain("We couldn't confirm Claude Code was disconnected.");
    expect(live().textContent).not.toContain("Disconnected");
    expect(rowButton("c1")).not.toBeNull();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(heading());
  });

  it("미확인 알림이 머리 아래에 서면 첫 행 선은 행↔행(진한) 선이다 — 약한 선이 두 겹이 되지 않는다", async () => {
    mocks.disconnect.mockRejectedValue(new TypeError("Failed to fetch"));
    await mount(APPS);
    await click(rowButton("c1"));
    await click(dialog()!.querySelector("[data-disconnect-confirm]"));
    const first = find<HTMLElement>(card(), "ul").firstElementChild as HTMLElement;
    expect(first.className).toContain("border-border");
    expect(first.className).not.toContain("border-foreground/[0.06]");
  });
});

describe("연결 행 — 왼쪽 로고 칸(IconTile lg)", () => {
  const tile = (id: string) => find<HTMLElement>(document.body, `[data-app-row="${id}"] [data-app-logo]`);

  /** 로고는 서버가 client_id 호스트로 고른 `brand`만 따른다 — 이름이 "Claude Code"여도 brand가 없으면 MCP 기본 아이콘이다. */
  it("brand가 있으면 그 로고, 없으면 MCP 아이콘", async () => {
    await mount([app({}), app({ id: "c9", name: "Claude Code", ident: "example.com/claude-code.json", brand: null })]);
    expect(tile("c1").querySelector("img")?.getAttribute("src")).toBe("/brand/agents/claude.svg");
    expect(tile("c9").querySelector("img")).toBeNull();
    expect(tile("c9").querySelector("svg")).not.toBeNull();
    // 40 칸이다(DESIGN IconTile lg) — 행 안의 28 칸이 아니다(사용자 지시).
    expect(tile("c1").className).toContain("size-10");
  });

  /** OpenAI 원본은 마크가 뷰박스의 67%뿐이라 표시만 1.5배다 — 파일을 고치지 않는다(브랜드 규정). */
  it("OpenAI 로고만 표시 크기를 키운다", async () => {
    await mount([app({}), app({ id: "c3", ident: "chatgpt.com/oauth/codex/x/client.json", brand: "openai" })]);
    expect(tile("c3").querySelector("img")?.className).toContain("scale-150");
    expect(tile("c1").querySelector("img")?.className).not.toContain("scale-150");
  });

  it("Disconnect는 danger다 — 행의 다른 동작과 구분된다", async () => {
    await mount([app({})]);
    expect(rowButton("c1")?.className).toContain("bg-destructive/8");
  });

  it("끊기 확인창의 카드도 같은 로고 칸을 든다", async () => {
    await mount([app({})]);
    await click(rowButton("c1"));
    const box = find<HTMLElement>(dialog()!, "[data-disconnect-app]");
    expect(box.querySelector("img")?.getAttribute("src")).toBe("/brand/agents/claude.svg");
    expect(box.textContent).toContain("claude.ai/oauth/claude-code-client-metadata");
  });
});

/** Connect 카드를 걷고(2026-09-30 사용자) 서버 주소는 카드 머리의 복사 버튼 하나로 남았다 — 다른 복사 버튼과 같은 `CopyButton`이다. */
describe("머리 — Copy server URL", () => {
  it("연결이 없어도 머리에 서고, 누르면 이 환경의 서버 주소를 복사한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await mount([]);
    const copy = button(card(), "Copy server URL");
    expect(copy).not.toBeNull();
    await click(copy);
    expect(writeText).toHaveBeenCalledWith(SERVER_URL);
    expect(button(card(), "Copied")).not.toBeNull();
  });
});
