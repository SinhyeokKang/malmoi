// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { Sidebar } from "@/components/shell/sidebar";
import { m } from "@/lib/i18n";

import { render } from "./helpers/dom";

/**
 * **`New project`가 `Projects` 아래에 서고, 선택은 둘 중 하나만이다** (2026-09-27 사용자). `/projects`가 `/projects/new`의
 * 접두라 둘 다 `exact`가 아니면 새 프로젝트 화면에서 두 항목이 함께 선택돼 보인다.
 */
const path = vi.hoisted(() => ({ value: "/projects" }));
vi.mock("next/navigation", () => ({ usePathname: () => path.value }));

const current = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLAnchorElement>('a[aria-current="page"]')].map((a) => a.textContent?.replace(/\d+$/, "").trim());

describe("사이드바 — New project", () => {
  it("사용자 구역이 Projects · New project · Account 순이다", async () => {
    path.value = "/projects";
    const { container } = await render(<Sidebar memberships={[]} userName="Kim" userImage={null} />);
    const work = container.querySelector("nav")!;
    expect([...work.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["/projects", "/projects/new", "/account"]);
  });

  it("`/projects/new`에서는 New project 하나만 선택이다", async () => {
    path.value = "/projects/new";
    const { container } = await render(<Sidebar memberships={[]} userName="Kim" userImage={null} />);
    expect(current(container)).toEqual([m.common.nav.newProject]);
  });

  it("`/projects`에서는 Projects 하나만 선택이다", async () => {
    path.value = "/projects";
    const { container } = await render(<Sidebar memberships={[]} userName="Kim" userImage={null} />);
    expect(current(container)).toEqual([m.common.nav.projects]);
  });
});
