// @vitest-environment jsdom
import { act, startTransition } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("@/app/(edit)/actions", () => ({ saveTranslationKey: vi.fn(), previewTranslationRevert: vi.fn(), revertTranslationKey: vi.fn(), triggerPullAction: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: vi.fn(), checkOpenPullRequest: vi.fn(), prepareRepositorySync: vi.fn() }));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: vi.fn() }));

import { TranslationWorkspace } from "@/components/translations/workspace/workspace";
import type { ConnectionHealth } from "@/lib/github-connect/health";
import { en } from "@/messages/en";
import { STATE, stateLabel } from "@/lib/status/canon";
import { connectionReason } from "@/lib/translations/connection-reason";

import { props } from "./helpers/workspace-props";

/**
 * **번역 화면의 Publish·Sync도 끊기면 꺼진다** (ux-drift-unify T20 · 🔴 F — #52 재발 경로였다). Home 머리와 같은 `planActionAvailability`다.
 * DB로 가를 수 있는 둘(`not-connected`·`unpinned`)은 **첫 렌더부터**, GitHub이 가르는 셋은 **스트리밍으로 도착한 뒤** 끈다. 모름은 끄지 않는다.
 */
const buttons = (container: HTMLElement) => {
  const all = [...container.querySelectorAll("button")];
  return {
    sync: all.find((b) => b.textContent?.trim() === en.repositorySync.action),
    publish: all.find((b) => b.textContent?.startsWith("Publish")),
  };
};
const off = (button: HTMLButtonElement | undefined) => button?.getAttribute("aria-disabled") === "true";
/** GitHub 판정이 정상으로 도착한 모양 — `planConnectionHealth`의 `ok` 갈래다. */
const OK: ConnectionHealth = { status: "ok" };

describe("첫 렌더 — DB 판정", () => {
  it.each(["not-connected", "unpinned"] as const)("%s면 Sync·Publish가 처음부터 꺼져 있다", async (status) => {
    const { container } = await render(<TranslationWorkspace {...props({ connection: { status } })} />);
    const { sync, publish } = buttons(container);
    expect(off(sync)).toBe(true);
    expect(off(publish)).toBe(true);
    // 꺼진 이유는 끊김이다 — Publish 대기 문구도, 원인 없는 "currently unavailable"도 아니다(malmoi#160).
    expect(sync?.getAttribute("title")).toBe(connectionReason(en, status, "OWNER"));
  });

  /**
   * **원인을 말한다** (malmoi#160) — 이 화면엔 Home의 연결 배너가 없어 사유가 "…currently unavailable"뿐이었다. 두 버튼의 사유가
   * Home 배너와 같은 낱말 + 역할별 해법이다.
   */
  it.each(["OWNER", "EDITOR"] as const)("unpinned · %s — Publish·Sync 사유가 끊김과 해법을 말한다", async (role) => {
    const { container } = await render(<TranslationWorkspace {...props({ role, unpublished: 2, connection: { status: "unpinned" } })} />);
    const reason = connectionReason(en, "unpinned", role)!;
    const { publish } = buttons(container);
    expect(document.getElementById(publish?.getAttribute("aria-describedby") ?? "")?.textContent).toBe(reason);
    if (role === "OWNER") expect(buttons(container).sync?.getAttribute("title")).toBe(reason);
  });

  /**
   * **보류 배너가 꺼진 Publish를 가리키지 않는다** (malmoi#160) — [Send with Publish ↑]는 포커스만 옮기는데 그 버튼이 꺼져 있었다. Publish가
   * 연결 때문에 꺼진 동안은 그 액션을 세우지 않고 같은 사유를 배너 문장에 잇는다(화면에 보이는 유일한 원인 문장이다).
   */
  it("unpinned면 보류 배너에 Send with Publish가 없고 끊김 사유를 잇는다", async () => {
    const { container } = await render(<TranslationWorkspace {...props({ unpublished: 2, connection: { status: "unpinned" } })} />);
    const banner = [...container.querySelectorAll('[role="status"], [role="alert"], div')].find((el) => el.textContent?.startsWith(en.translations.banner.paused(2)))!;
    expect(banner.textContent).toContain(connectionReason(en, "unpinned", "OWNER")!);
    expect([...container.querySelectorAll("button")].some((b) => b.textContent?.includes(en.translations.banner.sendWithPublish))).toBe(false);
  });

  it("연결되면 보류 배너가 Send with Publish를 든다", async () => {
    const { container } = await render(<TranslationWorkspace {...props({ unpublished: 2, connection: { status: "unknown" } })} />);
    expect([...container.querySelectorAll("button")].some((b) => b.textContent?.includes(en.translations.banner.sendWithPublish))).toBe(true);
  });

  /** 첫 페인트(SSR HTML — hydration 전)부터 꺼져 있다. 클라이언트 effect에 기대면 hydration 전 한동안 눌린다(U7 r1 — 런타임 (b)4에서 옮겼다). */
  it("서버 HTML에서부터 Sync·Publish가 aria-disabled다", () => {
    const html = renderToString(<TranslationWorkspace {...props({ unpublished: 2, connection: { status: "unpinned" } })} />);
    const host = document.createElement("div");
    host.innerHTML = html;
    const { sync, publish } = buttons(host);
    expect(off(sync)).toBe(true);
    expect(off(publish)).toBe(true);
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
    const ok = await render(<TranslationWorkspace {...props({ connection: { status: "unknown", later: Promise.resolve(OK) } })} />);
    expect(off(buttons(ok.container).publish)).toBe(false);
    expect(off(buttons(ok.container).sync)).toBe(false);
  });

  /**
   * **U7 r1 🔴1** — 이미 보인 Suspense 경계 안에서 `use(새 promise)`를 하면 키 선택·필터·트리 이동(`navigate("replace")`)과 저장 뒤 재검증이 GitHub probe가
   * 끝날 때까지 커밋되지 않았다. 도착 판정은 effect로 구독하고, 새 판정이 올 때까지 마지막 도착값을 든다.
   */
  /**
   * **U7 r2** — 소스·프로젝트를 옮겨도 작업 화면이 마운트된 채 남을 수 있다. 옛 소스의 연결 판정이 새 조회가 끝날 때까지 남으면 다른 프로젝트의
   * Publish·Sync를 끄거나 켠다. 식별 키(프로젝트 · 소스)가 바뀌면 도착값을 버리고 새 첫 렌더 판정(`status`)으로 돌아간다.
   */
  it("프로젝트·소스가 바뀌면 옛 판정이 서지 않는다", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<TranslationWorkspace {...props({ unpublished: 1, connection: { status: "unknown", later: Promise.resolve({ status: "app-uninstalled" } as ConnectionHealth) } })} />));
    expect(off(buttons(container).sync)).toBe(true);
    const later = (health: Promise<ConnectionHealth>, over: { slug?: string; routeSurfaceSlug?: string }) =>
      act(async () => startTransition(() => root.render(<TranslationWorkspace {...props({ ...over, unpublished: 1, connection: { status: "unknown", later: health } })} />)));
    // 소스만 바뀐다 — 같은 프로젝트의 다른 소스.
    await later(new Promise<ConnectionHealth>(() => {}), { routeSurfaceSlug: "app" });
    expect(off(buttons(container).sync)).toBe(false);
    expect(off(buttons(container).publish)).toBe(false);
    // 프로젝트가 바뀐다.
    await later(Promise.resolve({ status: "app-uninstalled" } as ConnectionHealth), { routeSurfaceSlug: "app" });
    expect(off(buttons(container).sync)).toBe(true);
    await later(new Promise<ConnectionHealth>(() => {}), { slug: "globex", routeSurfaceSlug: "app" });
    expect(off(buttons(container).sync)).toBe(false);
    await act(async () => root.unmount());
    container.remove();
  });

  it("새 promise가 대기 중이어도 전환이 커밋되고 마지막 판정이 남는다", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<TranslationWorkspace {...props({ unpublished: 1, connection: { status: "unknown", later: Promise.resolve({ status: "app-uninstalled" } as ConnectionHealth) } })} />));
    expect(off(buttons(container).sync)).toBe(true);
    await act(async () => startTransition(() => root.render(
      <TranslationWorkspace {...props({ unpublished: 4, connection: { status: "unknown", later: new Promise<ConnectionHealth>(() => {}) } })} />,
    )));
    expect(buttons(container).publish?.textContent).toContain("4");
    expect(off(buttons(container).sync)).toBe(true);
    await act(async () => root.unmount());
    container.remove();
  });
});

describe("표시 — Unsent · 보류 배너 · Revert", () => {
  it("미전달은 StatusBadge unsent다 — 테두리 알약이 아니다", async () => {
    const { container } = await render(<TranslationWorkspace {...props()} />);
    const badges = [...container.querySelectorAll("span.rounded-full")].filter((b) => b.textContent === stateLabel(en, "unsent"));
    expect(badges.length).toBeGreaterThanOrEqual(2); // 목록 행 + 상세 로케일
    for (const badge of badges) {
      expect(badge.className).toContain("bg-foreground/5");
      expect(badge.className).not.toContain("border");
    }
  });

  it("pending-edits 보류 배너는 neutral이다 — 이 화면만의 예외(DESIGN §2.4 예외 1)", async () => {
    const { container } = await render(<TranslationWorkspace {...props({ unpublished: 3 })} />);
    const banner = [...container.querySelectorAll("div")].find((el) => /\bbg-(muted|warning-surface)\b/.test(el.className) && el.textContent?.includes(en.translations.banner.paused(3)));
    expect(banner?.className).toContain("bg-muted");
  });

  it("Revert 트리거는 danger다 — 확정이 danger라서다", async () => {
    const { container } = await render(<TranslationWorkspace {...props()} />);
    const revert = [...container.querySelectorAll("button")].find((b) => b.textContent === en.translations.workspace.revert.button);
    expect(revert?.className).toContain("destructive");
  });
});
