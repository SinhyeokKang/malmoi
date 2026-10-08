// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Sidebar } from "@/components/shell/sidebar";
import { en } from "@/messages/en";
import { routes } from "@/lib/routes";
import { setUnread } from "@/lib/inbox/unread-store";

import { render } from "./helpers/dom";

/**
 * **사용자 구역** (2026-09-30 사용자) — 머리(아바타 + 이름 줄)가 없고 `New project`가 없다. New project는 앱 셸 헤더의 아바타
 * 왼쪽 버튼이 든다. 구역 이름은 여전히 사용자 이름이다 — landmark 둘을 가르는 접근 이름이라서다.
 */
const path = vi.hoisted(() => ({ value: "/projects" }));
vi.mock("next/navigation", () => ({ usePathname: () => path.value }));

const memberships = [{ slug: "acme", name: "Acme", role: "OWNER" as const, archived: false, image: null }];
// 안 읽음 수는 모듈 store라 파일 안 테스트 사이로 샌다(inbox-page D2).
afterEach(() => { setUnread(0); });

describe("사이드바 — 사용자 구역", () => {
  it("항목이 Projects · Inbox · MCP connector · Preferences · Account 순이다 — New project가 없다", async () => {
    path.value = "/projects";
    const { container } = await render(<Sidebar memberships={[]} userName="Kim" />);
    const work = container.querySelector('nav[aria-label="Kim"]')!;
    expect([...work.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["/projects", "/inbox", "/mcp", "/preferences", "/account"]);
    expect(container.querySelector(`a[href="${routes.newProject()}"]`)).toBeNull();
    expect(container.textContent).not.toContain(en.common.nav.newProject);
  });

  it("머리 줄이 없다 — 아바타도 이름 글자도 그리지 않는다", async () => {
    path.value = "/projects/acme";
    const { container } = await render(<Sidebar memberships={memberships} userName="Kim" />);
    const work = container.querySelector('nav[aria-label="Kim"]')!;
    expect(work.querySelector("[data-zone-head]")).toBeNull();
    expect(work.querySelector("img")).toBeNull();
    expect(work.textContent).not.toContain("Kim");
    // 프로젝트 구역 머리는 그대로다.
    expect(container.querySelector('nav[aria-label="Acme"] [data-zone-head]')?.textContent).toBe("Acme");
  });
});

/**
 * **개수 배지는 0이면 서지 않고 sr 문장을 든다** (2026-10-01 ux-drift-unify Q13 — 옛 규칙 "0도 보인다"의 철회).
 * `lib/shell/nav.ts`는 0을 그대로 낸다 — 그것을 읽히는 방식은 화면(`CountBadge`)이 정한다.
 */
describe("사이드바 — 개수 배지", () => {
  it("프로젝트 0개면 Projects 항목에 배지가 없다", async () => {
    path.value = "/projects";
    const { container } = await render(<Sidebar memberships={[]} userName="Kim" />);
    expect(container.querySelector('a[href="/projects"] .rounded-full')).toBeNull();
  });

  it("프로젝트가 있으면 숫자는 aria-hidden이고 문장이 짝이다", async () => {
    path.value = "/projects";
    const { container } = await render(<Sidebar memberships={memberships} userName="Kim" />);
    const pill = container.querySelector('a[href="/projects"] .rounded-full')!;
    expect(pill.querySelector("[aria-hidden]")?.textContent).toBe("1");
    expect(pill.querySelector(".sr-only")?.textContent).toBe(en.projects.count(1));
  });
});

/**
 * **Inbox 배지는 서버 값이 아니라 탭 안 store 값이다** (inbox-page D2·D5 · spec 6a) — 헤더 배지와 같은 n이고 표시만 다르다(헤더는 `9+`, 사이드바는 실제 수).
 * 배지 수를 위한 조회를 따로 하지 않는다 — 헤더 `AttentionInbox`가 쓴 수를 읽기만 한다.
 */
describe("사이드바 — Inbox 안 읽음 배지", () => {
  const inbox = (container: HTMLElement) => container.querySelector<HTMLElement>(`a[href="${routes.inbox()}"]`)!;

  it("store 수를 그대로 보인다 — 10 이상도 실제 수이고 sr 문장은 n unread다", async () => {
    path.value = "/projects";
    setUnread(12);
    const { container } = await render(<Sidebar memberships={[]} userName="Kim" />);
    const pill = inbox(container).querySelector(".rounded-full")!;
    expect(pill.querySelector("[aria-hidden]")?.textContent).toBe("12");
    expect(pill.querySelector(".sr-only")?.textContent).toBe(en.common.nav.inboxCount(12));
    expect(en.common.nav.inboxCount(12)).toBe("12 unread");
  });

  it("0이면 배지가 없고, store가 바뀌면 따라간다", async () => {
    path.value = "/projects";
    const { container } = await render(<Sidebar memberships={[]} userName="Kim" />);
    expect(inbox(container).querySelector(".rounded-full")).toBeNull();
    await act(async () => { setUnread(3); });
    expect(inbox(container).querySelector(".rounded-full [aria-hidden]")?.textContent).toBe("3");
    await act(async () => { setUnread(0); });
    expect(inbox(container).querySelector(".rounded-full")).toBeNull();
  });

  it("/inbox에서 Inbox 항목이 현재 페이지이고 라벨·글리프는 헤더 트리거와 같은 Inbox다", async () => {
    path.value = "/inbox";
    const { container } = await render(<Sidebar memberships={[]} userName="Kim" />);
    expect(inbox(container).getAttribute("aria-current")).toBe("page");
    expect(inbox(container).textContent).toContain(en.common.nav.inbox);
    expect(inbox(container).querySelector("svg.lucide-inbox")).not.toBeNull();
    expect(container.querySelector('a[href="/projects"]')?.getAttribute("aria-current")).toBeNull();
  });
});
