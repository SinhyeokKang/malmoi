// @vitest-environment jsdom
import { act, useState } from "react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { m } from "@/lib/i18n";

import { render } from "./helpers/dom";

async function click(node: Element) { await act(async () => { await userEvent.setup().click(node); }); }
const byText = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].filter(b => b.textContent?.trim() === label).at(-1)!;

/**
 * **트리거 없는 Dialog도 연 자리로 돌아온다** (audit #34). Radix의 기본 복귀 대상은 `DialogTrigger`라 상태로 여는
 * Dialog(미저장 확인 · Revert · 배너의 [Try again])는 닫히면 포커스가 `body`로 빠졌다. 중첩이면 **부모 모달 밖**이다.
 */
function Opener() {
  const [open, setOpen] = useState(false);
  return <>
    <Button onClick={() => setOpen(true)}>Open</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title="Discard?" footer={<DialogClose asChild><Button>Keep editing</Button></DialogClose>} />
    </Dialog>
  </>;
}

it("상태로 연 Dialog를 닫으면 연 버튼으로 포커스가 돌아온다", async () => {
  await render(<Opener />);
  await click(byText("Open"));
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  await click(byText("Keep editing"));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(byText("Open"));
});

it("연 버튼이 사라졌으면 가로채지 않는다 — 호출부의 onCloseAutoFocus가 먼저다", async () => {
  function Host() {
    const [open, setOpen] = useState(false);
    const [shown, setShown] = useState(true);
    return <>
      <h1 id="title" tabIndex={-1}>Title</h1>
      {shown && <Button onClick={() => setOpen(true)}>Open</Button>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Gone" onCloseAutoFocus={event => { event.preventDefault(); document.getElementById("title")?.focus(); }}
          footer={<Button onClick={() => { setShown(false); setOpen(false); }}>Close</Button>} />
      </Dialog>
    </>;
  }
  await render(<Host />);
  await click(byText("Open"));
  await click(byText("Close"));
  expect(document.activeElement?.id).toBe("title");
});

/**
 * **Alert를 닫아도 포커스가 `body`로 빠지지 않는다** (audit #35) — 닫기 버튼이 Alert와 함께 언마운트된다.
 * 착지점은 Alert 자리의 **다음** 포커스 가능 요소다(없으면 앞). 브라우저의 순차 탐색 시작점이 거기이므로
 * 키보드 사용자에게 가장 덜 놀라운 자리다.
 */
it("Alert 닫기는 그 자리의 다음 컨트롤로 착지한다", async () => {
  function Host() {
    const [shown, setShown] = useState(true);
    return <>
      <Button>Before</Button>
      {shown && <Alert onDismiss={() => setShown(false)} title="Synced" />}
      <Button>After</Button>
    </>;
  }
  // jsdom은 rect가 비어 있어 모든 요소가 "안 보인다" — 착지의 가시성 판정을 통과시킨다.
  const rects = vi.spyOn(Element.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
  await render(<Host />);
  await click(document.querySelector(`[aria-label="${m.common.dismiss}"]`)!);
  rects.mockRestore();
  expect(document.body.textContent).not.toContain("Synced");
  expect(document.activeElement).toBe(byText("After"));
});

/**
 * **단일 선택 메뉴의 선택 상태가 접근성 트리에 있다** (audit #36). `selected`는 `bg-muted` + 체크 글리프라는 시각
 * 표시뿐이었다 — 스크린리더는 어느 필터가 켜졌는지 몰랐다. `selected`를 받는 항목은 `menuitemradio`다.
 */
it("selected를 받는 메뉴 항목은 menuitemradio + aria-checked다 — 안 받는 항목은 menuitem 그대로", async () => {
  await render(<DropdownMenu>
    <DropdownMenuTrigger asChild><Button>Kind</Button></DropdownMenuTrigger>
    <DropdownMenuContent>
      <DropdownMenuItem selected>All</DropdownMenuItem>
      <DropdownMenuItem selected={false}>Publish</DropdownMenuItem>
      <DropdownMenuItem>Custom…</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>);
  await act(async () => { await userEvent.setup().click(byText("Kind")); });
  const items = [...document.querySelectorAll('[role^="menuitem"]')];
  expect(items.map(item => [item.getAttribute("role"), item.getAttribute("aria-checked")])).toEqual([
    ["menuitemradio", "true"], ["menuitemradio", "false"], ["menuitem", null],
  ]);
});

/**
 * ⚠️ **연 자리가 꺼졌으면 더 오래된 요소로 거슬러 가지 않는다** (B5 리뷰) — 그러면 무관한 컨트롤에 포커스가 서고, "빠졌을 때만"
 * 옮기는 호출부의 착지(`useLandAfter`)가 그것을 살아 있는 포커스로 읽어 비켜선다.
 */
it("연 버튼이 꺼져 있으면 그 앞의 무관한 버튼으로 가지 않는다", async () => {
  function Host() {
    const [open, setOpen] = useState(false);
    const [off, setOff] = useState(false);
    return <>
      <Button>Older</Button>
      <Button disabled={off} onClick={() => setOpen(true)}>Open</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Run" footer={<Button onClick={() => { setOff(true); setOpen(false); }}>Run</Button>} />
      </Dialog>
    </>;
  }
  await render(<Host />);
  await click(byText("Older"));
  await click(byText("Open"));
  await click(byText("Run"));
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  expect(document.activeElement).not.toBe(byText("Older"));
});

/**
 * ⚠️ **Safari·macOS Firefox는 마우스 클릭으로 버튼에 포커스를 주지 않는다** (B5 리뷰 r1 🔴) — 트리거에 `focusin`이 안 와서 기록의
 * 마지막이 더 오래된 요소였고, 닫힐 때 Radix의 트리거 복귀를 가로채 **엉뚱한 자리로 스크롤까지** 튀었다. 여기서는 포커스를 옮기지
 * 않는 클릭(`dispatchEvent`)으로 그 브라우저를 흉내 낸다.
 */
function clickWithoutFocus(node: Element) {
  node.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

it("포커스 없이 트리거를 눌러 연 Dialog는 닫히면 트리거로 돌아온다 — 앞서 포커스를 가진 요소로 튀지 않는다", async () => {
  const { DialogTrigger } = await import("@/components/ui/dialog");
  await render(<>
    <input id="earlier" />
    <Dialog>
      <DialogTrigger asChild><Button>Rotate</Button></DialogTrigger>
      <DialogContent title="Rotate?" footer={<DialogClose asChild><Button>Cancel</Button></DialogClose>} />
    </Dialog>
  </>);
  document.getElementById("earlier")!.focus();
  await act(async () => { clickWithoutFocus(byText("Rotate")); });
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  // Radix의 트리거 복귀는 FocusScope 언마운트의 타이머 뒤다 — 한 틱으로는 아직 body다.
  await act(async () => { clickWithoutFocus(byText("Cancel")); await new Promise(r => setTimeout(r, 20)); });
  expect(document.activeElement).toBe(byText("Rotate"));
});

it("포커스 없이 버튼을 눌러 상태로 연 Dialog도 그 버튼으로 돌아온다", async () => {
  function Host() {
    const [open, setOpen] = useState(false);
    return <>
      <input id="earlier" />
      <Button onClick={() => setOpen(true)}>Open</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Discard?" footer={<DialogClose asChild><Button>Keep editing</Button></DialogClose>} />
      </Dialog>
    </>;
  }
  await render(<Host />);
  document.getElementById("earlier")!.focus();
  await act(async () => { clickWithoutFocus(byText("Open")); });
  await act(async () => { clickWithoutFocus(byText("Keep editing")); await new Promise(r => setTimeout(r, 20)); });
  expect(document.activeElement).toBe(byText("Open"));
});
