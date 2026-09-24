// @vitest-environment jsdom
import { createContext, useContext, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { Sidebar } from "@/components/shell/sidebar";
import { render } from "./helpers/dom";

/**
 * **누른 사이드바 항목이 응답 전에 반응한다** (audit-ux #6). 선택 표시가 커밋 뒤의 `usePathname`을 봐서, 느린 이동
 * 동안 옛 항목에 남고 누른 항목은 아무 표시도 없었다.
 *
 * `useLinkStatus`는 App Router 밖(jsdom)에서 늘 `pending: false`라, 링크 하나만 pending인 상태를 가짜 `Link`가
 * 문맥으로 만든다 — 실물과 같이 **그 링크의 자손**만 값을 받는다.
 */
const pendingHref = vi.hoisted(() => ({ value: "" }));
vi.mock("next/navigation", () => ({ usePathname: () => "/projects/acme" }));
vi.mock("next/link", () => {
  const Status = createContext(false);
  return {
    default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
      <Status.Provider value={href === pendingHref.value}>
        <a href={href} {...props}>{children}</a>
      </Status.Provider>
    ),
    useLinkStatus: () => ({ pending: useContext(Status) }),
  };
});

const memberships = [{ slug: "acme", name: "Acme", role: "OWNER" as const, archived: false, defaultSurfaceSlug: "app" }];
const sidebar = () => render(<Sidebar memberships={memberships} userName="Kim" userImage={null} signOut={() => {}} />);
const link = (container: HTMLElement, href: string) => container.querySelector<HTMLAnchorElement>(`a[href="${href}"]`)!;

describe("사이드바 이동 pending", () => {
  it("이동 중인 항목만 pending 표식을 들고, 선택 면을 그 표식으로 세운다", async () => {
    pendingHref.value = "/projects/acme/members";
    const { container } = await sidebar();
    const members = link(container, "/projects/acme/members");
    expect(members.querySelector("[data-nav-pending]")).not.toBeNull();
    expect(members.className).toContain("has-[[data-nav-pending]]:bg-foreground/[0.07]");
    // 짝 — 나머지 항목에는 표식이 없다.
    expect(container.querySelectorAll("[data-nav-pending]")).toHaveLength(1);
  });

  it("이동이 없으면 표식이 0이다 — 선택은 여전히 aria-current가 말한다", async () => {
    pendingHref.value = "";
    const { container } = await sidebar();
    expect(container.querySelectorAll("[data-nav-pending]")).toHaveLength(0);
    expect(link(container, "/projects/acme").getAttribute("aria-current")).toBe("page");
  });

  it("Translations는 기본 표면의 주소다 — 셸 데이터가 그 slug를 싣는다 (audit-ux #4)", async () => {
    pendingHref.value = "";
    const { container } = await sidebar();
    expect(link(container, "/projects/acme/surfaces/app/translations")).not.toBeNull();
  });
});
