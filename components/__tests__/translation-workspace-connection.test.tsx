// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("@/app/(edit)/actions", () => ({ saveTranslationKey: vi.fn(), previewTranslationRevert: vi.fn(), revertTranslationKey: vi.fn(), triggerPullAction: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: vi.fn(), checkOpenPullRequest: vi.fn(), prepareRepositorySync: vi.fn() }));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: vi.fn() }));

import { TranslationWorkspace } from "@/components/translations/workspace/workspace";
import type { ConnectionHealth } from "@/lib/github-connect/health";
import { m } from "@/lib/i18n";
import { STATE } from "@/lib/status/canon";

import { props } from "./helpers/workspace-props";

/**
 * **번역 화면의 Publish·Sync도 끊기면 꺼진다** (ux-drift-unify T20 · 🔴 F — #52 재발 경로였다). Home 머리와 같은 `planActionAvailability`다.
 * DB로 가를 수 있는 둘(`not-connected`·`unpinned`)은 **첫 렌더부터**, GitHub이 가르는 셋은 **스트리밍으로 도착한 뒤** 끈다. 모름은 끄지 않는다.
 */
const buttons = (container: HTMLElement) => {
  const all = [...container.querySelectorAll("button")];
  return {
    sync: all.find((b) => b.textContent?.trim() === m.repositorySync.action),
    publish: all.find((b) => b.textContent?.startsWith("Publish")),
  };
};
const off = (button: HTMLButtonElement | undefined) => button?.getAttribute("aria-disabled") === "true";

describe("첫 렌더 — DB 판정", () => {
  it.each(["not-connected", "unpinned"] as const)("%s면 Sync·Publish가 처음부터 꺼져 있다", async (status) => {
    const { container } = await render(<TranslationWorkspace {...props({ connection: { status } })} />);
    const { sync, publish } = buttons(container);
    expect(off(sync)).toBe(true);
    expect(off(publish)).toBe(true);
    // 꺼진 이유는 끊김이다 — Publish 대기 문구가 아니다.
    expect(sync?.getAttribute("title")).toBe(m.repositorySync.paused);
  });

  it("모름(unknown)은 끄지 않는다 — 누르면 서버가 다시 판정한다", async () => {
    const { container } = await render(<TranslationWorkspace {...props({ connection: { status: "unknown" } })} />);
    const { sync, publish } = buttons(container);
    expect(off(sync)).toBe(false);
    expect(off(publish)).toBe(false);
  });
});

describe("스트리밍 — GitHub 판정", () => {
  it.each(["app-uninstalled", "installation-changed", "repo-replaced"] as const)("%s가 도착하면 꺼진다", async (status) => {
    const later = Promise.resolve({ status } as ConnectionHealth);
    const { container } = await render(<TranslationWorkspace {...props({ connection: { status: "unknown", later } })} />);
    const { sync, publish } = buttons(container);
    expect(off(sync)).toBe(true);
    expect(off(publish)).toBe(true);
  });

  it("도착 전과 ok 도착은 켜진 채다 — 목록·상세는 기다리지 않는다", async () => {
    const pending = await render(<TranslationWorkspace {...props({ connection: { status: "unknown", later: new Promise<ConnectionHealth>(() => {}) } })} />);
    expect(off(buttons(pending.container).sync)).toBe(false);
    expect(pending.container.querySelector("textarea")).not.toBeNull();
    const ok = await render(<TranslationWorkspace {...props({ connection: { status: "unknown", later: Promise.resolve({ status: "unknown" } as ConnectionHealth) } })} />);
    expect(off(buttons(ok.container).publish)).toBe(false);
  });
});

describe("표시 — Unsent · 보류 배너 · Revert", () => {
  it("미전달은 StatusBadge unsent다 — 테두리 알약이 아니다", async () => {
    const { container } = await render(<TranslationWorkspace {...props()} />);
    const badges = [...container.querySelectorAll("span.rounded-full")].filter((b) => b.textContent === STATE.unsent.label);
    expect(badges.length).toBeGreaterThanOrEqual(2); // 목록 행 + 상세 로케일
    for (const badge of badges) {
      expect(badge.className).toContain("bg-foreground/5");
      expect(badge.className).not.toContain("border");
    }
  });

  it("pending-edits 보류 배너는 neutral이다 — 이 화면만의 예외(DESIGN §2.4 예외 1)", async () => {
    const { container } = await render(<TranslationWorkspace {...props({ unpublished: 3 })} />);
    const banner = [...container.querySelectorAll("div")].find((el) => /\bbg-(muted|amber-50)\b/.test(el.className) && el.textContent?.includes(m.translations.banner.paused(3)));
    expect(banner?.className).toContain("bg-muted");
  });

  it("Revert 트리거는 danger다 — 확정이 danger라서다", async () => {
    const { container } = await render(<TranslationWorkspace {...props()} />);
    const revert = [...container.querySelectorAll("button")].find((b) => b.textContent === m.translations.workspace.revert.button);
    expect(revert?.className).toContain("destructive");
  });
});
