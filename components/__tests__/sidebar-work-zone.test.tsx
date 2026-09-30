// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { Sidebar } from "@/components/shell/sidebar";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";

import { render } from "./helpers/dom";

/**
 * **사용자 구역** (2026-09-30 사용자) — 머리(아바타 + 이름 줄)가 없고 `New project`가 없다. New project는 앱 셸 헤더의 아바타
 * 왼쪽 버튼이 든다. 구역 이름은 여전히 사용자 이름이다 — landmark 둘을 가르는 접근 이름이라서다.
 */
const path = vi.hoisted(() => ({ value: "/projects" }));
vi.mock("next/navigation", () => ({ usePathname: () => path.value }));

const memberships = [{ slug: "acme", name: "Acme", role: "OWNER" as const, archived: false, image: null }];

describe("사이드바 — 사용자 구역", () => {
  it("항목이 Projects · MCP connector · Account 순이다 — New project가 없다", async () => {
    path.value = "/projects";
    const { container } = await render(<Sidebar memberships={[]} userName="Kim" />);
    const work = container.querySelector('nav[aria-label="Kim"]')!;
    expect([...work.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["/projects", "/mcp", "/account"]);
    expect(container.querySelector(`a[href="${routes.newProject()}"]`)).toBeNull();
    expect(container.textContent).not.toContain(m.common.nav.newProject);
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
