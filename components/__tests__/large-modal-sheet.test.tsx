// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { act, useState } from "react";
import userEvent from "@testing-library/user-event";
import { compile } from "tailwindcss";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/button";
import { Command, CommandInput, CommandList } from "@/components/ui/command";
import { CommandDialog } from "@/components/ui/dialog";
import { LargeModal, LARGE_MODAL_HEIGHT, LARGE_MODAL_OVERLAY, LARGE_MODAL_PANEL } from "@/components/ui/large-modal";
import { en } from "@/messages/en";

import { find, render } from "./helpers/dom";

/**
 * **큰 모달 규칙 — `lg` 미만은 전체 화면 시트다** (responsive-public design §1 · §2 · 2026-10-10 사용자).
 *
 * jsdom은 폭을 못 재므로 계약을 클래스로 든다: ① `lg` 이상의 클래스는 **이 배치 전 문자열과 같다**(`max-lg:` 토큰을 걷으면
 * 바이트로 같다) ② 시트 형은 전부 `max-lg:` 토큰이다 ③ 소비자 `className`(높이 덮어쓰기)이 `cn()`에서 시트 토큰을 지우지 않는다
 * ④ 그 토큰이 실제로 `@media (width < 64rem)` CSS를 낸다. 실제 높이·footer 도달·safe-area는 실측 몫이다.
 */
const WIDE = {
  overlay: "bg-scrim/32 fixed inset-0 z-50 backdrop-blur-[6px]",
  panel: "bg-background border-border border fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-var(--spacing-modal-gutter))] max-w-[1024px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl shadow-medium",
  height: "min-h-[min(80svh,800px,calc(100svh-var(--spacing-modal-gutter)))] max-h-[min(800px,calc(100svh-var(--spacing-modal-gutter)))]",
};
const SHEET_PANEL = [
  "max-lg:inset-0", "max-lg:w-full", "max-lg:max-w-none", "max-lg:translate-none",
  "max-lg:rounded-none", "max-lg:border-0", "max-lg:shadow-none",
  "max-lg:h-dvh", "max-lg:min-h-0", "max-lg:max-h-none",
  "max-lg:pt-[env(safe-area-inset-top)]", "max-lg:pb-[env(safe-area-inset-bottom)]",
];
const SHEET_OVERLAY = ["max-lg:bg-transparent", "max-lg:backdrop-blur-none"];

const tokens = (value: string) => value.split(" ").filter(Boolean);
const wide = (value: string) => tokens(value).filter(token => !token.startsWith("max-lg:")).join(" ");
const narrow = (value: string) => tokens(value).filter(token => token.startsWith("max-lg:"));

let fixup: MutationObserver;
beforeEach(() => {
  fixup = new MutationObserver(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !active.matches(":disabled")) return;
    active.removeAttribute("disabled");
    active.blur();
    active.setAttribute("disabled", "");
  });
  fixup.observe(document.body, { attributes: true, attributeFilter: ["disabled"], subtree: true });
});
afterEach(() => fixup.disconnect());

describe("그릇 상수", () => {
  it("`lg` 이상은 이 배치 전과 바이트로 같다", () => {
    expect(wide(LARGE_MODAL_OVERLAY)).toBe(WIDE.overlay);
    expect(wide(LARGE_MODAL_PANEL)).toBe(WIDE.panel);
    expect(LARGE_MODAL_HEIGHT).toBe(WIDE.height);
  });

  it("`lg` 미만 시트 형 — inset 0 · radius·선·그림자·scrim 없음 · 100dvh · safe-area", () => {
    expect(narrow(LARGE_MODAL_PANEL)).toEqual(SHEET_PANEL);
    expect(narrow(LARGE_MODAL_OVERLAY)).toEqual(SHEET_OVERLAY);
    // 면은 `--background` 그대로다 — 시트에서 다른 면을 쓰지 않는다.
    expect(tokens(LARGE_MODAL_PANEL)).toContain("bg-background");
  });

  it("시트 토큰이 실제로 `lg` 미만 미디어 쿼리 CSS를 낸다", async () => {
    const require = createRequire(join(process.cwd(), "package.json"));
    const globalsPath = join(process.cwd(), "app/globals.css");
    const compiler = await compile(readFileSync(globalsPath, "utf8"), {
      base: dirname(globalsPath),
      loadStylesheet: async (id, base) => {
        const path = require.resolve(id === "tailwindcss" ? "tailwindcss/index.css" : id, { paths: [base] });
        return { path, base: dirname(path), content: readFileSync(path, "utf8") };
      },
    });
    for (const token of [...SHEET_PANEL, ...SHEET_OVERLAY]) {
      const css = compiler.build([token]);
      const utilities = css.split("@layer utilities {")[1] ?? "";
      expect(utilities, token).toContain("@media (width < 64rem)");
    }
  });
});

describe("LargeModal — 소비자 코드 변경 없이 규칙을 받는다", () => {
  /** 실제 소비자의 덮어쓰기 형 셋 — ci-card·add-sources(`h-[…] min-h-0`), Publish 갈래(`min-h-[…] max-h-[…]`), Sources 실패(`min-h-0`). */
  it.each([
    ["h-[min(640px,calc(100svh-var(--spacing-modal-gutter)))] min-h-0"],
    ["min-h-[min(620px,calc(100svh-var(--spacing-modal-gutter)))] max-h-[min(680px,calc(100svh-var(--spacing-modal-gutter)))]"],
    ["min-h-0"],
  ])("className %s가 시트 토큰을 지우지 않는다", async (className) => {
    await render(<LargeModal open title="Invite" onClose={() => {}} className={className} actions={<Button>Done</Button>}><p>Body</p></LargeModal>);
    const panel = find<HTMLElement>(document.body, '[role="dialog"]');
    for (const token of SHEET_PANEL) expect(panel.classList.contains(token), token).toBe(true);
    for (const token of tokens(className)) expect(panel.classList.contains(token), token).toBe(true);
    expect(panel.previousElementSibling?.className).toBe(LARGE_MODAL_OVERLAY);
  });

  it("머리 56(좌 16 · 우 12 · 아래 divider) · 제목 18 · 닫기 32 · 몸통·바닥 안쪽 16 — `lg` 이상은 그대로다", async () => {
    await render(<LargeModal open title="Invite" description="Add people" onClose={() => {}} actions={<Button>Done</Button>}><p>Body</p></LargeModal>);
    const panel = find<HTMLElement>(document.body, '[role="dialog"]');
    const header = find<HTMLElement>(panel, "header");
    expect(wide(header.className)).toBe("flex items-start justify-between gap-2 px-8 pt-8 pb-5");
    // ⚠️ 세로 가운데 정렬을 머리에 걸지 않는다 — 설명이 감겨 머리가 자라면 닫기가 제목+설명 묶음의 가운데로 내려간다. 머리는 `items-start`
    // (넓은 폭과 같은 기본)이고, 제목 묶음이 최소 32(닫기 높이)에서 세로 가운데라 제목 단독일 때 56 안에서 둘 다 가운데다.
    expect(narrow(header.className)).toEqual(["max-lg:min-h-14", "max-lg:border-b", "max-lg:border-divider", "max-lg:py-3", "max-lg:pr-3", "max-lg:pl-4"]);
    expect(header.classList.contains("items-start")).toBe(true);
    const heading = find<HTMLElement>(header, "h2").parentElement!;
    expect(wide(heading.className)).toBe("flex min-w-0 flex-col gap-1.5");
    expect(narrow(heading.className)).toEqual(["max-lg:min-h-8", "max-lg:justify-center"]);
    const title = find<HTMLElement>(header, "h2");
    expect(wide(title.className)).toBe("text-xl font-medium");
    expect(narrow(title.className)).toEqual(["max-lg:text-lg"]);
    const close = find<HTMLButtonElement>(header, `button[aria-label="${en.newProject.modal.close}"]`);
    expect(close.classList.contains("size-9")).toBe(true);
    expect(narrow(close.className)).toEqual(["max-lg:size-8"]);

    const body = find<HTMLElement>(panel, "[data-onboarding-body]");
    expect(wide(body.className)).toBe("flex min-h-0 flex-1 gap-4 px-8 pt-0.5 pb-6 focus:outline-none flex-col overflow-y-auto");
    expect(narrow(body.className)).toEqual(["max-lg:px-4", "max-lg:pt-4"]);
    const footer = find<HTMLElement>(panel, "footer");
    expect(wide(footer.className)).toBe("border-divider flex items-center justify-between gap-2 border-t px-8 py-6");
    expect(narrow(footer.className)).toEqual(["max-lg:px-4"]);
    // footer는 몸통 밖 바닥이다 — 몸통 하나만 스크롤한다.
    expect(body.contains(footer)).toBe(false);
    expect(panel.lastElementChild).toBe(footer);
  });
});

describe("CommandDialog — 같은 시트 · 머리 = 입력 · Cancel은 `lg` 미만에서만", () => {
  function Search({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
    const [open, setOpen] = useState(false);
    return <>
      <Button onClick={() => setOpen(true)}>Opener</Button>
      <CommandDialog open={open} onOpenChange={next => { onOpenChange?.(next); setOpen(next); }} title="Search">
        <Command ids={[]} query="abc">
          <CommandInput value="abc" onValueChange={() => {}} label="Search" placeholder="Search…" />
          <CommandList label="Results">{null}</CommandList>
        </Command>
      </CommandDialog>
    </>;
  }

  const openSearch = async (onOpenChange?: (open: boolean) => void) => {
    await render(<Search onOpenChange={onOpenChange} />);
    const opener = [...document.querySelectorAll("button")].find(button => button.textContent === "Opener")!;
    await act(async () => { await userEvent.setup().click(opener); });
    return opener;
  };

  it("`top-4 translate-y-0`이 시트 토큰을 지우지 않는다", async () => {
    await openSearch();
    const dialog = find<HTMLElement>(document.body, '[role="dialog"]');
    for (const token of SHEET_PANEL) expect(dialog.classList.contains(token), token).toBe(true);
    expect(dialog.classList.contains("top-4")).toBe(true);
    expect(dialog.previousElementSibling?.className).toBe(LARGE_MODAL_OVERLAY);
  });

  it("입력 줄이 머리 56이 되고 Esc 칩은 `lg` 미만에서 숨는다 — `lg` 이상 클래스는 그대로다", async () => {
    await openSearch();
    const row = find<HTMLElement>(document.body, '[role="combobox"]').closest<HTMLElement>(".border-b")!;
    expect(wide(row.className)).toBe("border-divider flex h-12 shrink-0 items-center gap-2 border-b pr-4 pl-3");
    expect(narrow(row.className)).toEqual(["max-lg:h-14", "max-lg:pr-2"]);
    const esc = find(row, "kbd").parentElement!;
    expect(esc.className).toBe("hidden shrink-0 lg:inline-flex");
    expect(row.lastElementChild).toBe(esc);
  });

  it("Cancel(ghost sm · `m.common.cancel`)은 `lg:hidden`이고 누르면 닫힌다", async () => {
    const onOpenChange = vi.fn();
    const opener = await openSearch(onOpenChange);
    const row = find<HTMLElement>(document.body, '[role="combobox"]').closest<HTMLElement>(".border-b")!;
    const cancel = [...row.querySelectorAll("button")].find(button => button.textContent === en.common.cancel)!;
    expect(cancel).toBeDefined();
    expect(cancel.type).toBe("button");
    expect([...cancel.classList]).toEqual(expect.arrayContaining(["lg:hidden", "h-7", "text-muted-foreground"]));
    await act(async () => { await userEvent.setup().click(cancel); });
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    // 닫히면 연 자리로 돌아간다 — 누른 Cancel은 떨어져 있어 기록에서 빠진다.
    await vi.waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it("다이얼로그 밖의 CommandInput에는 Cancel이 없다", async () => {
    const { container } = await render(<Command ids={[]} query="">
      <CommandInput value="" onValueChange={() => {}} label="Search" placeholder="Search…" />
      <CommandList label="Results">{null}</CommandList>
    </Command>);
    expect([...container.querySelectorAll("button")].some(button => button.textContent === en.common.cancel)).toBe(false);
  });
});

describe("랜딩 목업은 시트가 되지 않는다 (design §1 ⚠️)", () => {
  it("목업 Publish 껍데기는 그릇 상수를 import하지 않고 `lg` 미만 토큰이 없다", () => {
    const source = readFileSync(join(process.cwd(), "components/landing/mockup/publish.tsx"), "utf8");
    expect(source).not.toMatch(/from "@\/components\/ui\/large-modal"/);
    expect(source).not.toContain("max-lg:");
  });
});
