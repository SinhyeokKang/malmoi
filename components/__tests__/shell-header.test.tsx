// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createContext, useContext, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { PUBLIC_HEADER_LINK } from "@/components/public-shell/header";
import { HeaderBar } from "@/components/shell/header-bar";
import { Header } from "@/components/shell/header";
import { en } from "@/messages/en";
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

vi.mock("next/navigation", () => ({ usePathname: () => "/projects" }));
// 헤더 Inbox는 마운트 때 배지 Action을 부른다 — 이 파일은 배치만 본다(동작은 `attention-inbox.test.tsx`).
vi.mock("@/app/(edit)/inbox/actions", () => ({
  loadAttentionBadgeAction: vi.fn(async () => ({ status: "failed" })),
  openAttentionInboxAction: vi.fn(async () => ({ status: "failed" })),
}));

const header = () => render(<Header m={en} name="Kim" email="kim@acme.com" image={null} signOut={vi.fn()} memberships={[]} />);

describe("HeaderBar — 세 슬롯", () => {
  it("동일 폭 양옆 칸과 세 정렬 슬롯으로 가운데를 고정한다", async () => {
    const { container } = await render(<HeaderBar start={<span>Start</span>} center={<span>Center</span>} end={<span>End</span>} />);
    const bar = container.querySelector("header");
    expect(bar).not.toBeNull();
    expect(bar?.className.split(/\s+/)).toEqual(expect.arrayContaining(["grid", "h-11", "shrink-0", "grid-cols-[1fr_auto_1fr]", "items-center", "px-1"]));
    expect([...bar!.children].map(slot => slot.className)).toEqual(["justify-self-start", "justify-self-center", "justify-self-end"]);
    expect([...bar!.children].map(slot => slot.textContent)).toEqual(["Start", "Center", "End"]);
  });
});

/** search-ux-unify C20 — 두 헤더의 로고 링크 radius가 같다(`rounded-sm`). 앱 헤더의 `rounded-lg`(12)는 32 칸에서 원에 가까웠다. */
describe("로고 링크 radius", () => {
  it("앱 셸 헤더 로고가 rounded-sm이다", async () => {
    const { container } = await header();
    const logo = container.querySelector<HTMLAnchorElement>(`a[aria-label="${en.common.nav.appHome}"]`);
    expect(logo).not.toBeNull();
    expect(logo!.classList.contains("rounded-sm")).toBe(true);
    expect(logo!.classList.contains("rounded-lg")).toBe(false);
  });
  it("공개 셸 헤더 로고도 rounded-sm이다", () => {
    const source = readFileSync(join(process.cwd(), "components/public-shell/header.tsx"), "utf8");
    const logo = /aria-label=\{m\.landing\.shell\.logo\}\s*className="([^"]+)"/.exec(source);
    expect(logo).not.toBeNull();
    expect(logo![1]!.split(/\s+/)).toContain("rounded-sm");
  });
});

describe("앱 셸 헤더", () => {
  it("HeaderBar를 쓰고 가운데 슬롯에 검색 캡슐이 선다", async () => {
    const { container } = await header();
    const bar = container.querySelector("header");
    expect(bar).not.toBeNull();
    expect(bar?.classList.contains("grid-cols-[1fr_auto_1fr]")).toBe(true);
    expect(bar?.children).toHaveLength(3);
    expect(bar?.children[0]?.className).toBe("justify-self-start");
    expect(bar?.children[1]?.className).toBe("justify-self-center");
    expect(bar!.children[1]!.querySelector('button[aria-label="Search"]')).not.toBeNull();
    expect(bar?.children[2]?.className).toBe("justify-self-end");
  });
  /** attention-inbox H1 — Inbox는 세로선 오른쪽·아바타 왼쪽이다: `[New project] | [Inbox] [avatar]`. */
  it("우측은 New project · 구분선 · Inbox · 사용자 메뉴 순서다", async () => {
    const { container } = await header();
    const right = container.querySelector("header > .justify-self-end > div");
    const kids = [...(right?.children ?? [])];
    expect(kids).toHaveLength(4);
    expect(kids[0]?.getAttribute("href")).toBe(routes.newProject());
    expect(kids[1]?.getAttribute("aria-hidden")).toBe("true");
    expect(kids[1]?.className).toContain("bg-border-subtle");
    expect(kids[2]?.getAttribute("aria-label")).toBe(en.inbox.label);
    expect(kids[2]?.getAttribute("aria-haspopup")).toBe("menu");
    expect(kids[3]?.getAttribute("aria-label")).toBe(en.common.nav.userMenu);
  });

  it("New project는 Plus 아이콘 + 글자이고 공개 셸 GitHub 링크와 같은 모양이다 — 같은 탭", async () => {
    const { container } = await header();
    const link = container.querySelector(`header a[href="${routes.newProject()}"]`);
    expect(link?.textContent).toBe(en.common.nav.newProject);
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
