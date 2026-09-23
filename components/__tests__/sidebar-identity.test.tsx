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

const sidebar = () => render(<Sidebar memberships={memberships} userName="Kim" userImage="https://avatars.example/kim.png" signOut={() => {}} />);

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
});
