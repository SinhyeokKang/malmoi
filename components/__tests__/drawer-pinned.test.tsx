// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";
import { Dialog, DrawerContent } from "@/components/ui/dialog";

import { render } from "./helpers/dom";

/**
 * **측면 서랍의 세로 바닥 슬롯 `pinned`** (responsive-app 시안 AT1b) — 앱 LNB 서랍은 바닥에 행 셋(New project · Changelog · Docs, 40)을 세로로
 * 고정한다. 공개 서랍의 `actions`는 스위처 둘의 가로 한 줄(48)이라 그 형을 바꾸지 않고 슬롯을 하나 더 둔다.
 */
const drawer = (props: { actions?: React.ReactNode; pinned?: React.ReactNode }) =>
  render(
    <Dialog open>
      <DrawerContent title="Main" start={<a href="/">Home</a>} {...props}>
        <a href="/x">Body</a>
      </DrawerContent>
    </Dialog>,
  );

describe("DrawerContent — 바닥 슬롯", () => {
  it("`pinned`는 몸통 스크롤 밖의 세로 행 줄이다", async () => {
    await drawer({ pinned: <a href="/docs">Docs</a> });
    const footer = document.querySelector<HTMLElement>("[data-drawer-pinned]")!;
    expect(footer.textContent).toBe("Docs");
    expect(footer.closest(".overflow-y-auto")).toBeNull();
    expect(footer.className.split(/\s+/)).toEqual(expect.arrayContaining(["flex", "shrink-0", "flex-col", "gap-0.5", "border-t", "border-divider", "px-3", "py-2"]));
    // 몸통 바로 뒤 형제 — 머리 · 몸통 · 바닥 순서다.
    expect(footer.previousElementSibling?.classList.contains("overflow-y-auto")).toBe(true);
  });

  it("공개 소비자(`actions`만)의 바닥은 그대로다 — 가로 한 줄 48", async () => {
    await drawer({ actions: <Button>Theme</Button> });
    expect(document.querySelector("[data-drawer-pinned]")).toBeNull();
    const footer = document.querySelector<HTMLElement>('[role="dialog"] > footer')!;
    expect(footer.className).toBe("border-divider flex h-12 shrink-0 items-center gap-5 border-t px-4");
  });

  it("둘 다 없으면 바닥이 없다", async () => {
    await drawer({});
    expect(document.querySelector('[role="dialog"] > footer')).toBeNull();
  });
});
