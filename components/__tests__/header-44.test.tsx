// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement as h } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setUnread } from "@/lib/inbox/unread-store";

import { AppFrame } from "@/components/landing/mockup/app-frame";
import { PublicShell } from "@/components/public-shell/public-shell";
import { Header } from "@/components/shell/header";
import { publicAccount } from "@/lib/auth/landing";
import { en } from "@/messages/en";

import { render } from "./helpers/dom";

vi.mock("next/navigation", () => ({ usePathname: () => "/projects" }));
vi.mock("@/lib/auth/sign-out", () => ({ signOutAction: async () => {} }));
// 앱 셸 헤더는 Inbox를 든다 — 실물 배지 Action이 세션·DB까지 가지 않게 막는다(R-B3 🟡1).
vi.mock("@/app/inbox/actions", () => ({
  loadAttentionBadgeAction: vi.fn(async () => ({ status: "failed" as const })),
  openAttentionInboxAction: vi.fn(async () => ({ status: "failed" as const })),
}));

/**
 * **헤더 44의 불변식을 클래스 값 산술로 잰다** (D8, 2026-10-04) — jsdom에는 레이아웃이 없어 실제 y는 못 잰다(런타임 실측이 정본).
 * 패널 시작 = 위 패딩 + 헤더 높이 + 헤더 아래 마진 = 56이다 — 앱 셸·공개 셸·랜딩 목업 셋이 같은 산식이다(목업도 2026-10-05부터 44).
 * 숫자 하나만 바뀌어도(예: `pt-2` + `mb-1.5` → 58) 이 합이 깨진다.
 */
const PX = /^(pt|pb|mb|h|p)-(\d+(?:\.\d+)?)$/;
const px = (el: Element | null | undefined, prefix: string): number => {
  const hit = [...(el?.classList ?? [])].map((c) => PX.exec(c)).find((m) => m?.[1] === prefix);
  if (!hit) throw new Error(`no ${prefix}-* class on ${el?.className}`);
  return Number(hit[2]) * 4;
};

describe("헤더 44 — 패널 시작 56 · 요소 중심 28", () => {
  it("공개 셸: 위 6 + 헤더 44 + 헤더 mb 6", async () => {
    const { container } = await render(h(PublicShell, { m: en, account: publicAccount({ status: "none" }), children: h("p", null, "body") }));
    const outer = container.querySelector("main")!.parentElement!;
    const header = outer.querySelector("header")!;
    expect(px(outer, "pt") + px(header, "h") + px(header, "mb")).toBe(56);
    expect(px(outer, "pt") + px(header, "h") / 2).toBe(28);
  });

  it("앱 셸: 위 6 + 헤더 44 + 헤더 mb 6 (레이아웃 `pt-1.5`, 자식 둘뿐이라 gap 없음)", async () => {
    const layout = readFileSync(join(process.cwd(), "app/(edit)/layout.tsx"), "utf8");
    const root = /className="([^"]*\bh-svh\b[^"]*)"/.exec(layout)![1]!;
    const outer = document.createElement("div");
    outer.className = root;
    expect(root).not.toMatch(/\bgap-/);
    const { container } = await render(h(Header, { m: en, name: "Ada", email: null, image: null, signOut: () => {}, memberships: [] }));
    const header = container.querySelector("header")!;
    expect(px(outer, "pt") + px(header, "h") + px(header, "mb")).toBe(56);
    expect(px(outer, "pt") + px(header, "h") / 2).toBe(28);
  });

  /** 2026-10-05 사용자 — 목업만 40을 지키던 예외를 걷었다. 앱 셸과 같은 산식이고 패널 시작 56은 옛 목업(8 + 40 + 8)과 같다. */
  it("랜딩 목업: 앱 셸과 같다 — 위 6 + 헤더 44 + 헤더 mb 6, gap 없음", async () => {
    const { container } = await render(h(AppFrame, { m: en, children: null }));
    const frame = container.firstElementChild!;
    const header = frame.querySelector("header")!;
    expect(px(header, "h")).toBe(44);
    expect(px(frame, "pt") + px(header, "h") + px(header, "mb")).toBe(56);
    expect(px(frame, "pt") + px(header, "h") / 2).toBe(28);
    expect([...frame.classList].some((c) => c.startsWith("gap-"))).toBe(false);
  });
});

// 안 읽음 수는 모듈 store라 파일 안 테스트 사이로 샌다(inbox-page D2) — 헤더·사이드바를 그리는 파일은 매번 되돌린다.
afterEach(() => { setUnread(0); });
