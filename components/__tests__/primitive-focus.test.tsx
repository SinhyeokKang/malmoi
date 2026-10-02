// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { act, useState, type ReactNode } from "react";
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
      <DialogContent title="Discard?" actions={<DialogClose asChild><Button>Keep editing</Button></DialogClose>} />
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
          actions={<Button onClick={() => { setShown(false); setOpen(false); }}>Close</Button>} />
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
        <DialogContent title="Run" actions={<Button onClick={() => { setOff(true); setOpen(false); }}>Run</Button>} />
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
      <DialogContent title="Rotate?" actions={<DialogClose asChild><Button>Cancel</Button></DialogClose>} />
    </Dialog>
  </>);
  document.getElementById("earlier")!.focus();
  await act(async () => { clickWithoutFocus(byText("Rotate")); });
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  /*
    Radix의 트리거 복귀는 FocusScope 언마운트의 타이머(`setTimeout`) 뒤다 — 한 틱으로는 아직 body다.
    ⚠️ **고정 대기(20ms)로 기다리지 않는다** — 언마운트는 `act`가 빠져나올 때 flush되고, 그 타이머가 `expect`보다 먼저 도는지는
    이벤트 루프 순서라 전체 스위트 부하에서 한 번씩 red였다. 조건이 설 때까지 폴링한다.
  */
  await act(async () => { clickWithoutFocus(byText("Cancel")); });
  await vi.waitFor(() => expect(document.activeElement).toBe(byText("Rotate")));
});

it("포커스 없이 버튼을 눌러 상태로 연 Dialog도 그 버튼으로 돌아온다", async () => {
  function Host() {
    const [open, setOpen] = useState(false);
    return <>
      <input id="earlier" />
      <Button onClick={() => setOpen(true)}>Open</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Discard?" actions={<DialogClose asChild><Button>Keep editing</Button></DialogClose>} />
      </Dialog>
    </>;
  }
  await render(<Host />);
  document.getElementById("earlier")!.focus();
  await act(async () => { clickWithoutFocus(byText("Open")); });
  await act(async () => { clickWithoutFocus(byText("Keep editing")); });
  // 위 테스트와 같은 이유로 폴링한다 — 고정 대기는 부하에서 한 번씩 red였다.
  await vi.waitFor(() => expect(document.activeElement).toBe(byText("Open")));
});

/**
 * **확인 Dialog의 첫 포커스는 푸터 Cancel이다** (DESIGN §6.4 Dialog · ux-drift-unify T13 · 3-Y4). 전엔 소비자 셋만 손으로 Cancel을
 * 지정했고 나머지는 Radix 기본(첫 tabbable = 헤더 X)에 떨어져, 같은 파괴 확인인데 첫 Tab·Enter가 닿는 곳이 갈렸다.
 * 표식(`data-initial-focus`)이 붙은 요소로 가되, 호출부가 `onOpenAutoFocus`를 막았거나 안쪽 `autoFocus`가 있으면 비켜선다.
 * ⚠️ jsdom 단언만으로 끝내지 않는다 — 브라우저 확인이 인계 (b) 목록에 있다(POSTMORTEM 2026-09-24: Radix의 열림 포커스가 소비자
 * effect보다 늦게 돌아 jsdom에서만 참이었다).
 */
function Confirm({ onOpenAutoFocus, inner }: { onOpenAutoFocus?: (event: Event) => void; inner?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button onClick={() => setOpen(true)}>Open</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title="Remove Jane?" onOpenAutoFocus={onOpenAutoFocus}
        actions={<><DialogClose asChild><Button data-initial-focus>Cancel</Button></DialogClose><Button variant="danger">Remove member</Button></>}>
        {inner}
      </DialogContent>
    </Dialog>
  </>;
}

it("열리면 표식 붙은 푸터 Cancel에 포커스가 선다 — 헤더 X도 파괴 확정도 아니다", async () => {
  await render(<Confirm />);
  await click(byText("Open"));
  expect(document.activeElement).toBe(byText("Cancel"));
});

it("호출부가 onOpenAutoFocus를 막으면 비켜선다", async () => {
  await render(<Confirm onOpenAutoFocus={event => event.preventDefault()} />);
  await click(byText("Open"));
  expect(document.activeElement).not.toBe(byText("Cancel"));
});

it("안쪽 autoFocus가 있으면 그것이 이긴다", async () => {
  await render(<Confirm inner={<input aria-label="From" autoFocus />} />);
  await click(byText("Open"));
  expect(document.activeElement?.getAttribute("aria-label")).toBe("From");
});

it("표식이 없으면 Radix 기본이다 — 첫 tabbable(헤더 닫기)", async () => {
  function Plain() {
    const [open, setOpen] = useState(false);
    return <>
      <Button onClick={() => setOpen(true)}>Open</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Plain" actions={<DialogClose asChild><Button>Cancel</Button></DialogClose>} />
      </Dialog>
    </>;
  }
  await render(<Plain />);
  await click(byText("Open"));
  expect(document.activeElement?.getAttribute("aria-label")).toBe(m.common.close);
});

/**
 * **확인 Dialog 소비자 전부가 첫 포커스를 정한다** — 푸터 Cancel 표식이거나(`data-initial-focus`), 입력이 할 일인 Dialog의 `autoFocus`다.
 * 둘 다 없으면 Radix 기본(헤더 X)에 떨어진다 — 3-Y4가 그 모양이었다. 새 Dialog가 표식을 빠뜨리면 이 목록이 red다.
 * ⚠️ `onOpenAutoFocus`로 손수 지정하는 형은 0이다 — 표식이 그 셋을 대체했다(archive · Sync · 연결 앱).
 */
it("DialogContent 소비자가 전부 첫 포커스를 정하고, 손으로 지정하는 onOpenAutoFocus가 0이다", () => {
  const ROOT = process.cwd();
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : walk(path);
    return name.endsWith(".tsx") ? [path] : [];
  });
  const consumers = ["app", "components"].flatMap((d) => walk(join(ROOT, d)))
    .map((path) => ({ path: relative(ROOT, path), text: readFileSync(path, "utf8") }))
    .filter(({ path, text }) => path !== "components/ui/dialog.tsx" && /<(?:DialogContent|CommandDialog)\b/.test(text));
  expect(consumers.length).toBeGreaterThanOrEqual(14);
  // 파일 단위가 아니라 Dialog 수로 센다 — 한 파일의 Dialog 둘이 표식 하나로 통과하면 안 된다(U3 r1).
  const count = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0;
  const short = consumers
    .map(({ path, text }) => ({ path, dialogs: count(text, /<(?:DialogContent|CommandDialog)\b/g), marks: count(text, /\bdata-initial-focus\b/g) + count(text, /\bautoFocus\b/g) }))
    .filter(({ dialogs, marks }) => dialogs > marks)
    .map(({ path, dialogs, marks }) => `${path}: ${dialogs} dialogs, ${marks} marks`);
  expect(short).toEqual([]);
  expect(consumers.filter(({ text }) => text.includes("onOpenAutoFocus")).map(({ path }) => path)).toEqual([]);
});

/**
 * #169 — 닫기를 막은 동안(`closeDisabled`, Sync 진행) 오버레이를 누르면 Dialog는 안 닫히지만 **브라우저의 mousedown 기본 동작**이 포커스를
 * 포커스 불가 오버레이로 옮기며 `body`로 떨어뜨렸다(Chromium 실측). Radix의 `onInteractOutside` preventDefault는 닫힘만 막는다.
 * ⚠️ jsdom은 mousedown의 기본 포커스 이동을 하지 않아 증상 자체는 red가 안 된다 — 그 기본 동작을 막았는지(`defaultPrevented`)를 잰다.
 */
function overlay() {
  const node = [...document.querySelectorAll<HTMLElement>("div[data-state='open']")].find(element => element.getAttribute("role") !== "dialog" && element.querySelector('[role="dialog"]') === null);
  if (node === undefined) throw new Error("no overlay");
  return node;
}
function mousedown(node: Element) {
  const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
  node.dispatchEvent(event);
  return event;
}
it("closeDisabled 동안 오버레이의 mousedown 기본 동작을 막아 포커스가 남는다 — 짝: 막지 않으면 오버레이 클릭이 닫는다", async () => {
  function Host({ locked }: { locked: boolean }) {
    const [open, setOpen] = useState(true);
    return <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title="Syncing" closeDisabled={locked} actions={<Button aria-disabled busy>Run</Button>} />
    </Dialog>;
  }
  const view = await render(<Host locked />);
  byText("Run").focus();
  const event = mousedown(overlay());
  await act(async () => { overlay().dispatchEvent(new Event("pointerdown", { bubbles: true })); });
  expect(event.defaultPrevented).toBe(true);
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(document.activeElement).toBe(byText("Run"));

  await view.rerender(<Host locked={false} />);
  expect(mousedown(overlay()).defaultPrevented).toBe(false);
  await act(async () => { overlay().dispatchEvent(new Event("pointerdown", { bubbles: true })); });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
