// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { Sidebar } from "@/components/shell/sidebar";
import { render } from "./helpers/dom";

let pathname = "/projects";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const memberships = [
  { slug: "acme", name: "Acme", role: "OWNER" as const, archived: false, image: "https://blob.example/acme.webp" },
  { slug: "beta", name: "Beta", role: "EDITOR" as const, archived: false, image: null },
];

const sidebar = () => render(<Sidebar memberships={memberships} userName="Kim" userImage="https://avatars.example/kim.png" />);

/**
 * **구역 라벨 앞에 대상의 얼굴이 선다** (2026-09-24 사용자) — 사용자 축은 아바타(원), 프로젝트 축은
 * 썸네일(라운드 사각). ⚠️ **모양이 대상을 말한다**(DESIGN §6.4) — 둘이 같은 모양이면 구역이 안 갈린다.
 */
describe("사이드바 구역 머리의 아바타·썸네일", () => {
  it("사용자 구역은 사용자 사진을 원으로 든다", async () => {
    const { container } = await sidebar();
    const head = container.querySelector('nav[aria-label="Kim"] [data-zone-head]');
    const img = head?.querySelector("img");
    expect(img?.getAttribute("src")).toBe("https://avatars.example/kim.png");
    expect(img?.className).toContain("rounded-full");
    expect(head?.textContent).toBe("Kim");
  });

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
  it("아바타·썸네일이 항목 아이콘과 같은 16이고, 라벨 시작점이 항목과 같다", async () => {
    pathname = "/projects/beta";
    const { container } = await sidebar();
    const user = container.querySelector('nav[aria-label="Kim"] [data-zone-head] img') as HTMLImageElement | null;
    expect(user?.style.width).toBe("16px");
    expect(user?.style.height).toBe("16px");
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
  it("16 썸네일은 radius 4라 원으로 안 보이고, 16 이니셜은 `text-2xs`다", async () => {
    pathname = "/projects/beta";
    const { container } = await render(<Sidebar memberships={memberships} userName="Kim" userImage={null} />);
    const tile = container.querySelector('nav[aria-label="Beta"] [data-zone-head] > :first-child');
    expect(tile?.className.split(" ")).toContain("rounded");
    expect(tile?.className.split(" ")).not.toContain("rounded-sm");
    const initial = container.querySelector('nav[aria-label="Kim"] [data-zone-head] > :first-child');
    expect(initial?.textContent).toBe("K");
    expect(initial?.className.split(" ")).toContain("text-2xs");
    expect(initial?.className.split(" ")).not.toContain("text-xs");
  });

  it("아바타·썸네일에 테두리가 없다", async () => {
    pathname = "/projects/beta";
    const { container } = await sidebar();
    const user = container.querySelector('nav[aria-label="Kim"] [data-zone-head] img');
    const tile = container.querySelector('nav[aria-label="Beta"] [data-zone-head] > :first-child');
    for (const el of [user, tile]) {
      expect(el).not.toBeNull();
      expect(el?.className.split(" ")).not.toContain("border");
    }
  });
});
