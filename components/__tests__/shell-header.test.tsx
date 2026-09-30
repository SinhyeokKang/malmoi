// @vitest-environment jsdom
import { createContext, useContext, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { PUBLIC_HEADER_LINK } from "@/components/public-shell/header";
import { Header } from "@/components/shell/header";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";

import { render } from "./helpers/dom";

/**
 * **앱 셸 헤더 우측** (2026-09-30 사용자) — 공개 셸 헤더와 같은 패턴이고 GitHub 자리만 `New project`다:
 * `New project · 구분선 · 아바타 메뉴`. 링크 모양은 공개 셸의 GitHub 링크와 **같은 클래스 한 벌**이다.
 */
/** `useLinkStatus`는 jsdom에서 늘 false라 가짜 `Link`가 문맥으로 pending을 만든다(`sidebar-pending.test.tsx`와 같다). */
const pendingHref = vi.hoisted(() => ({ value: "" }));
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

const header = () => render(<Header name="Kim" email="kim@acme.com" image={null} signOut={vi.fn()} />);

describe("앱 셸 헤더", () => {
  it("우측은 New project · 구분선 · 사용자 메뉴 순서다", async () => {
    const { container } = await header();
    const right = container.querySelector("header > div:last-child");
    const kids = [...(right?.children ?? [])];
    expect(kids).toHaveLength(3);
    expect(kids[0]?.getAttribute("href")).toBe(routes.newProject());
    expect(kids[1]?.getAttribute("aria-hidden")).toBe("true");
    expect(kids[1]?.className).toContain("bg-border-subtle");
    expect(kids[2]?.getAttribute("aria-label")).toBe(m.common.nav.userMenu);
  });

  it("New project는 Plus 아이콘 + 글자이고 공개 셸 GitHub 링크와 같은 모양이다 — 같은 탭", async () => {
    const { container } = await header();
    const link = container.querySelector(`header a[href="${routes.newProject()}"]`);
    expect(link?.textContent).toBe(m.common.nav.newProject);
    expect(link?.className).toBe(PUBLIC_HEADER_LINK);
    expect(link?.hasAttribute("target")).toBe(false);
    const icon = link?.querySelector("svg");
    expect(icon?.getAttribute("class")).toContain("lucide-plus");
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
  });

  /** POSTMORTEM 2026-09-17 — 모달 도착까지 1초 남짓 반응이 없으면 클릭이 안 먹은 것처럼 보인다. */
  it("이동 중에는 Plus 대신 스피너다", async () => {
    pendingHref.value = routes.newProject();
    const { container } = await header();
    const icon = container.querySelector(`header a[href="${routes.newProject()}"] svg`);
    expect(icon?.getAttribute("class")).toContain("animate-spin");
    pendingHref.value = "";
  });
});
