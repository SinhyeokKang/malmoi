// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { setUnread } from "@/lib/inbox/unread-store";

import { Sidebar } from "@/components/shell/sidebar";
import { render } from "./helpers/dom";

let pathname = "/projects";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const memberships = [
  { slug: "acme", name: "Acme", role: "OWNER" as const, archived: false, image: "https://blob.example/acme.webp" },
  { slug: "beta", name: "Beta", role: "EDITOR" as const, archived: false, image: null },
];

const sidebar = () => render(<Sidebar memberships={memberships} userName="Kim" />);

/**
 * **프로젝트 구역 라벨 앞에 그 프로젝트의 썸네일이 선다** (2026-09-24 사용자). 사용자 구역의 머리(아바타)는 2026-09-30에
 * 빠졌다(사용자) — `sidebar-work-zone.test.tsx`.
 */
describe("사이드바 프로젝트 구역 머리의 썸네일", () => {
  it("프로젝트 구역은 그 프로젝트의 이미지를 든다", async () => {
    pathname = "/projects/acme/logs";
    const { container } = await sidebar();
    const img = container.querySelector('nav[aria-label="Acme"] [data-zone-head] img');
    expect(img?.getAttribute("src")).toBe("https://blob.example/acme.webp");
  });

  it("이미지가 없는 프로젝트는 이름 색의 폴백 타일이다 — 빈 자리가 아니다", async () => {
    pathname = "/projects/beta";
    const { container } = await sidebar();
    const head = container.querySelector('nav[aria-label="Beta"] [data-zone-head]');
    expect(head?.querySelector("img")).toBeNull();
    expect(head?.querySelector("svg")).not.toBeNull();
    expect(head?.textContent).toBe("Beta");
  });

  /**
   * ⚠️ **머리의 얼굴이 아래 항목 아이콘과 같은 규격이다** (2026-09-25 사용자) — 16 · 같은 줄 틀(`h-8 px-2 gap-2` — 2026-09-28에
   * 접기가 돌아오며 옛 `p-1.5`에서 바뀌었다: 접힌 32 칸에서 아이콘이 가운데 서는 값)이라 머리 라벨과 항목 라벨의 시작점이 한 세로선에 선다.
   */
  it("썸네일이 항목 아이콘과 같은 16이고, 라벨 시작점이 항목과 같다", async () => {
    pathname = "/projects/beta";
    const { container } = await sidebar();
    const tile = container.querySelector('nav[aria-label="Beta"] [data-zone-head] > :first-child');
    expect(tile?.className).toContain("size-4");
    const head = container.querySelector('nav[aria-label="Beta"] [data-zone-head]');
    const item = container.querySelector('nav[aria-label="Beta"] a');
    for (const cls of ["h-8", "px-2", "gap-2"]) {
      expect(head?.className.split(" ")).toContain(cls);
      expect(item?.className.split(" ")).toContain(cls);
    }
  });

  /**
   * ⚠️ **모양·글자가 크기를 따라간다** (2026-09-27 사용자) — 16 상자에 radius 8(`rounded-sm`)이면 반지름이
   * 변의 절반이라 사각이 원이 되고, 13px 이니셜은 상자를 거의 채운다.
   */
  it("16 썸네일은 radius 4라 원으로 안 보인다", async () => {
    pathname = "/projects/beta";
    const { container } = await sidebar();
    const tile = container.querySelector('nav[aria-label="Beta"] [data-zone-head] > :first-child');
    expect(tile?.className.split(" ")).toContain("rounded");
    expect(tile?.className.split(" ")).not.toContain("rounded-sm");
  });

  it("썸네일에 테두리가 없다", async () => {
    pathname = "/projects/beta";
    const { container } = await sidebar();
    const tile = container.querySelector('nav[aria-label="Beta"] [data-zone-head] > :first-child');
    expect(tile).not.toBeNull();
    expect(tile?.className.split(" ")).not.toContain("border");
  });
});

// 안 읽음 수는 모듈 store라 파일 안 테스트 사이로 샌다(inbox-page D2) — 헤더·사이드바를 그리는 파일은 매번 되돌린다.
afterEach(() => { setUnread(0); });
