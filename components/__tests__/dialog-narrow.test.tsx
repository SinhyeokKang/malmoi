// @vitest-environment jsdom
import { expect, it } from "vitest";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";

import { render } from "./helpers/dom";

/**
 * **확인 Dialog의 좁은 형** (responsive-app O13 · 시안 AT8b). `lg` 미만에서 좌우 16을 남기고(375 → 343), 높이를 넘으면 **본문만** 스크롤해 footer가 화면 밖으로
 * 가지 않는다. footer는 감기되 오른쪽 정렬·순서·첫 포커스(Cancel)는 그대로다 — 전폭 세로 쌓기로 바꾸지 않는다.
 * ⚠️ `lg` 이상은 바이트 불변이다 — 새 값은 전부 `max-lg:` 아래다. jsdom은 미디어 쿼리를 못 재므로 클래스 계약을 센다(실측은 DS·QA).
 */
async function open() {
  await render(
    <Dialog open>
      <DialogContent title="Revert translations?" description="Long warning that wraps on narrow screens."
        actions={<><DialogClose asChild><Button data-initial-focus>Cancel</Button></DialogClose><Button variant="danger">Revert translations</Button></>}>
        <ul><li>en: before → after</li></ul>
      </DialogContent>
    </Dialog>,
  );
  return document.querySelector<HTMLElement>('[role="dialog"]')!;
}

it("lg 미만은 좌우 16을 남기고, lg 이상의 폭(w-full · 440)은 그대로다", async () => {
  const dialog = await open();
  for (const token of ["w-full", "max-w-110", "max-lg:w-[calc(100%-2rem)]"]) expect(dialog.classList.contains(token)).toBe(true);
  // 좁은 값이 lg 이상으로 새지 않는다 — 접두 없는 새 폭·높이 유틸이 없다.
  expect([...dialog.classList].filter(token => /^(?:max-h|flex|flex-col|overflow)/.test(token))).toEqual([]);
});

it("lg 미만은 높이를 넘으면 설명·본문만 스크롤한다 — 머리·footer는 스크롤 칸 밖이다", async () => {
  const dialog = await open();
  for (const token of ["max-lg:flex", "max-lg:flex-col", "max-lg:max-h-[calc(100dvh-2rem)]"]) expect(dialog.classList.contains(token)).toBe(true);
  const scroller = dialog.querySelector<HTMLElement>("[data-dialog-scroll]")!;
  for (const token of ["max-lg:min-h-0", "max-lg:overflow-y-auto"]) expect(scroller.classList.contains(token)).toBe(true);
  expect(scroller.querySelector("p")?.textContent).toBe("Long warning that wraps on narrow screens.");
  expect(scroller.querySelector("ul")).not.toBeNull();
  const header = dialog.querySelector("header")!;
  const footer = dialog.querySelector("footer")!;
  expect(scroller.contains(header) || scroller.contains(footer)).toBe(false);
  for (const node of [header, footer]) expect(node.classList.contains("max-lg:shrink-0")).toBe(true);
});

it("footer는 lg 미만에서 감기고 오른쪽 정렬·순서·첫 포커스는 그대로다 — 세로 전폭 쌓기가 아니다", async () => {
  const dialog = await open();
  const footer = dialog.querySelector("footer")!;
  for (const token of ["flex", "justify-end", "gap-2", "max-lg:flex-wrap"]) expect(footer.classList.contains(token)).toBe(true);
  expect([...footer.classList].filter(token => /flex-col|w-full|flex-wrap$/.test(token) && token !== "max-lg:flex-wrap")).toEqual([]);
  expect([...footer.querySelectorAll("button")].map(button => button.textContent)).toEqual(["Cancel", "Revert translations"]);
  expect(document.activeElement?.textContent).toBe("Cancel");
});
