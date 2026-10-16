// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReleaseList, RevealItem } from "@/components/changelog/release-list";
import { PublicScroller } from "@/components/public-shell/scroller";
import { buttonClass } from "@/components/ui/button";

import { find, render } from "./helpers/dom";

// 착지 호출 수를 센다 — 실물을 그대로 부르므로 스크롤·포커스 동작은 진짜 `landDocumentHeading`의 것이다.
const landing = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock("@/lib/public-doc/landing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/public-doc/landing")>();
  return { ...actual, landDocumentHeading: (id: string) => { landing.calls.push(id); return actual.landDocumentHeading(id); } };
});

/**
 * `/changelog`의 10개 단위 드러내기 (changelog-pagination design §4). 서버가 전 목록을 렌더하고 `ReleaseList`는 숨김만 푼다.
 * 항목은 `page.tsx`가 넘기는 형(`RevealItem` + 버전 `h1#vX.Y.Z tabIndex=-1`)을 그대로 흉내 낸다 — 본문 렌더는 이 잎의 일이 아니다.
 *
 * ⚠️ **브라우저 흉내 스텁** — jsdom은 `hidden` 안 요소에도 `tabindex`만 보고 포커스를 준다(POSTMORTEM 2026-09-20·09-24 부류).
 * 그대로 두면 `PublicScroller`가 숨은 `h1`에 포커스를 줘서 `ReleaseList`의 착지 코드를 지워도 green이다. 브라우저처럼
 * `closest("[hidden]")`인 요소의 `focus`를 아무 일도 안 하게 감싼다. 실제 증거는 실물 측정(tasks §6)이다.
 */

const TOTAL = 25;
/** index 0이 최신 — `v1.0.24` … `v1.0.0`. 18번째(index 17)는 `v1.0.7`이다. */
const tagAt = (index: number) => `v1.0.${TOTAL - 1 - index}`;

function Entry({ tag }: { tag: string }) {
  return (
    <section aria-labelledby={tag}>
      <h1 id={tag} tabIndex={-1}>{tag}</h1>
    </section>
  );
}

function list(total: number, trailing: ReactNode = null) {
  return (
    <ReleaseList total={total} showOlder="Show older releases" trailing={trailing}>
      {Array.from({ length: total }, (_, index) => (
        <RevealItem key={tagAt(index)} index={index}>
          <Entry tag={tagAt(index)} />
        </RevealItem>
      ))}
    </ReleaseList>
  );
}

/** `landDocumentHeading`은 `[data-public-scroller]` 조상이 없으면 아무것도 안 한다 — 맨 목록은 그 표식 하나로 감싼다. */
const inScroller = (node: ReactNode) => <div data-public-scroller="">{node}</div>;

const items = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>("[data-reveal-index]")];
const shown = (root: ParentNode) => items(root).filter((item) => !item.hidden).length;
const button = (root: ParentNode) => [...root.querySelectorAll("button")].find((node) => node.textContent === "Show older releases") ?? null;
const click = async (node: HTMLElement) => { await act(async () => node.click()); };

const nativeFocus = HTMLElement.prototype.focus;
/** `scrollTo` 호출마다 그 시점에 해시 대상이 숨어 있었는지 남긴다 — 숨은 대상으로는 스크롤할 위치가 없다. */
const scrolls: { top: number | undefined; targetHidden: boolean }[] = [];

beforeEach(() => {
  landing.calls.length = 0;
  scrolls.length = 0;
  HTMLElement.prototype.focus = function focusLikeBrowser(this: HTMLElement, options?: FocusOptions) {
    if (this.closest("[hidden]")) return;
    nativeFocus.call(this, options);
  };
  HTMLElement.prototype.scrollTo = function scrollToRecorder(this: HTMLElement, options?: ScrollToOptions | number) {
    const id = decodeURIComponentSafe(window.location.hash.slice(1));
    const target = id ? document.getElementById(id) : null;
    scrolls.push({ top: typeof options === "object" ? options.top : undefined, targetHidden: target?.closest("[hidden]") != null });
  } as HTMLElement["scrollTo"];
  vi.stubGlobal("matchMedia", (media: string) => ({ media, matches: false, addEventListener() {}, removeEventListener() {} }));
});

afterEach(() => {
  HTMLElement.prototype.focus = nativeFocus;
  Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
  vi.unstubAllGlobals();
  history.replaceState(null, "", window.location.pathname);
});

function decodeURIComponentSafe(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

describe("ReleaseList — 첫 렌더", () => {
  it("25개면 전부 DOM에 있고 1~10번째만 보인다", async () => {
    const { container } = await render(list(TOTAL));
    const all = items(container);
    expect(all).toHaveLength(25);
    expect(all.map((item) => item.dataset.revealIndex)).toEqual(Array.from({ length: 25 }, (_, index) => String(index)));
    expect(all.slice(0, 10).every((item) => !item.hidden)).toBe(true);
    expect(all.slice(10).every((item) => item.hidden)).toBe(true);
  });

  /** 감싸는 `div`에는 이름이 없다 — 랜드마크가 아니다. 이름은 안쪽 `section`의 `aria-labelledby`가 그대로 든다(POSTMORTEM 2026-09-15). */
  it("래퍼는 `div`이고 항목 `section`이 그 안에 그대로 있다", async () => {
    const { container } = await render(list(TOTAL));
    const first = items(container)[0];
    expect(first?.tagName).toBe("DIV");
    expect(first?.firstElementChild?.tagName).toBe("SECTION");
    expect(first?.firstElementChild?.getAttribute("aria-labelledby")).toBe(tagAt(0));
  });

  /** 버튼 `ghost` · `md`, 그릇은 가운데 + 아래 48이고 선이 없다(2026-10-16 사용자 — `ENTRY_BLOCK`을 주면 항목처럼 읽힌다). */
  it("목록 끝에 `Show older releases` 버튼 하나가 선다 — ghost·md, 그릇 `flex justify-center pb-12`", async () => {
    const { container } = await render(list(TOTAL));
    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(1);
    const node = find<HTMLButtonElement>(container, "button");
    expect(node.textContent).toBe("Show older releases");
    expect(node.type).toBe("button");
    for (const token of buttonClass({ variant: "ghost", size: "md" }).split(" ")) expect(node.classList).toContain(token);
    expect(node.parentElement?.className).toBe("flex justify-center pb-12");
    expect(node.parentElement?.className).not.toMatch(/border/);
    // 버튼은 마지막 항목 뒤에 선다.
    expect(items(container).at(-1)?.nextElementSibling).toBe(node.parentElement);
  });

  it("정확히 10개거나 그보다 적으면 버튼이 없다", async () => {
    for (const total of [10, 3, 0]) {
      const { container } = await render(list(total));
      expect(shown(container)).toBe(total);
      expect(container.querySelector("button")).toBeNull();
    }
  });
});

describe("ReleaseList — 더 보기", () => {
  it("누르면 다음 10개가 드러나고 포커스가 11번째 `h1`로 간다", async () => {
    const { container } = await render(list(TOTAL));
    await click(button(container)!);
    expect(shown(container)).toBe(20);
    expect(document.activeElement?.id).toBe(tagAt(10));
  });

  /** 마지막 묶음에서 버튼이 사라진다 — 포커스를 옮기지 않으면 body로 빠진다(POSTMORTEM 2026-09-24 "열한 곳"). */
  it("다시 누르면 21~25번째가 드러나고 포커스가 21번째 `h1`로 가며 버튼이 사라진다", async () => {
    const { container } = await render(list(TOTAL));
    await click(button(container)!);
    await click(button(container)!);
    expect(shown(container)).toBe(25);
    expect(document.activeElement?.id).toBe(tagAt(20));
    expect(document.activeElement).not.toBe(document.body);
    expect(button(container)).toBeNull();
  });

  it("스크롤만으로는 드러나지 않는다", async () => {
    const { container } = await render(inScroller(list(TOTAL)));
    const scroller = find<HTMLElement>(container, "[data-public-scroller]");
    await act(async () => {
      scroller.scrollTop = 10_000;
      scroller.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event("scroll"));
    });
    expect(shown(container)).toBe(10);
  });
});

describe("ReleaseList — 끝 문장(`trailing`)", () => {
  const older = <p data-testid="older">Older releases are on GitHub Releases.</p>;

  it("숨은 항목이 남은 동안 그려지지 않고, 마지막 묶음이 드러나면 버튼 자리에 선다", async () => {
    const { container } = await render(list(TOTAL, older));
    expect(container.querySelector("[data-testid=older]")).toBeNull();
    await click(button(container)!);
    expect(container.querySelector("[data-testid=older]")).toBeNull();
    await click(button(container)!);
    expect(button(container)).toBeNull();
    const sentence = find(container, "[data-testid=older]");
    expect(items(container).at(-1)?.nextElementSibling).toBe(sentence);
  });

  it("10개 이하면 처음부터 선다", async () => {
    const { container } = await render(list(7, older));
    expect(container.querySelector("button")).toBeNull();
    expect(items(container).at(-1)?.nextElementSibling).toBe(find(container, "[data-testid=older]"));
  });
});

describe("ReleaseList — 진입 해시", () => {
  /** 18번째(`v1.0.7`)는 둘째 묶음이다 — 20개까지 펴고 그 `h1`에 착지·포커스한다. */
  async function landsOnHidden(wrap: (node: ReactNode) => ReactNode) {
    history.replaceState(null, "", `#${tagAt(17)}`);
    const { container } = await render(wrap(list(TOTAL)));
    expect(shown(container)).toBe(20);
    expect(document.activeElement?.id).toBe(tagAt(17));
    expect(landing.calls).toEqual([tagAt(17)]);
    // 착지의 스크롤 호출 시점에 대상이 이미 드러나 있다 — 숨은 대상으로는 위치를 잴 수 없다.
    expect(scrolls.length).toBeGreaterThan(0);
    expect(scrolls.every((call) => !call.targetHidden)).toBe(true);
  }

  it("숨은 판의 주소로 들어오면 그 묶음까지 펴고 그 `h1`에 착지·포커스한다", async () => {
    await landsOnHidden(inScroller);
  });

  /**
   * ⚠️ **`PublicScroller` 안에서도 같다** — 자식 effect가 먼저 돌고 스크롤러가 마지막에 포커스를 정하는데, 그때 대상은 아직 `hidden`이라
   * 브라우저에서는 `focus()`가 아무 일도 안 한다. 그 뒤 리렌더에서 대상이 드러나고 `ReleaseList`의 착지가 포커스를 준다(design §4).
   */
  it("`PublicScroller` 안에서도 같다", async () => {
    await landsOnHidden((node) => <PublicScroller>{node}</PublicScroller>);
  });

  /** 이미 보이는 판은 `PublicScroller`가 지금처럼 처리한다 — `ReleaseList`가 착지를 다시 부르지 않는다. */
  it("이미 보이는 판의 주소면 아무것도 바꾸지 않고 착지를 부르지 않는다", async () => {
    history.replaceState(null, "", `#${tagAt(3)}`);
    const { container } = await render(<PublicScroller>{list(TOTAL)}</PublicScroller>);
    expect(shown(container)).toBe(10);
    expect(landing.calls).toEqual([]);
    expect(document.activeElement?.id).toBe(tagAt(3));
  });

  it("깨진 인코딩·없는 태그·목록 밖 요소는 아무것도 바꾸지 않는다", async () => {
    for (const hash of ["#%E0", "#v9.9.9", "#malmoi-i18n-push-v3", "#outside"]) {
      history.replaceState(null, "", hash);
      const { container } = await render(inScroller(<>{list(TOTAL)}<h2 id="outside" tabIndex={-1}>outside</h2></>));
      expect(shown(container)).toBe(10);
      expect(landing.calls).toEqual([]);
    }
  });

  /** 해시는 진입 때만 본다(spec §5) — `hashchange`를 듣지 않는다. */
  it("페이지에 머문 채 해시가 바뀌어도 펴지 않는다", async () => {
    const { container } = await render(inScroller(list(TOTAL)));
    await act(async () => {
      history.replaceState(null, "", `#${tagAt(17)}`);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(shown(container)).toBe(10);
    expect(landing.calls).toEqual([]);
  });
});
