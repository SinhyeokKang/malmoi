// @vitest-environment jsdom
import { join } from "node:path";

import { act, useState } from "react";
import { describe, expect, it } from "vitest";

import { MessagesProvider, useDateStyle, useMessages, useUiLocale } from "@/components/i18n/messages-provider";
import type { DateStyle } from "@/lib/date-format";
import type { Messages } from "@/lib/i18n";
import { UI_LOCALES, type UiLocale } from "@/lib/i18n/locales";
import { en } from "@/messages/en";

import { render } from "./helpers/dom";

/**
 * 클라이언트 사전 입구 (ui-locales tasks D1 · orch D7). provider가 없으면 en이고, ko·es는 `next/dynamic` 로더가 운반한다.
 * 언어를 바꿔도 **같은 트리가 새 문구로 다시 그려진다** — 재마운트되면 컨트롤의 포커스·상태가 사라진다(design §4).
 */
// jsdom에서는 `import.meta.url`이 file 스킴이 아니다 — vitest는 리포 루트에서 돈다.
const ROOT = process.cwd();

let seen: Messages | undefined;

function Probe() {
  const m = useMessages();
  const uiLocale = useUiLocale();
  const [clicks, setClicks] = useState(0);
  seen = m;
  return (
    <div>
      <label htmlFor="probe">{m.search.label}</label>
      <input id="probe" defaultValue="" />
      <button type="button" onClick={() => setClicks((n) => n + 1)}>{`${uiLocale}:${clicks}`}</button>
    </div>
  );
}

/** 이 언어 화면이 받아야 할 사전 — 그 언어 파일의 export다(파일이 없으면 import가 던져 red). */
async function expected(uiLocale: UiLocale): Promise<Messages> {
  if (uiLocale === "en") return en;
  const mod = (await import(join(ROOT, "messages", `${uiLocale}.tsx`))) as Record<string, Messages>;
  return mod[uiLocale] as Messages;
}

describe("MessagesProvider", () => {
  it("provider가 없으면 en이다 — global-error와 기존 DOM 테스트가 그대로 돈다", async () => {
    const { container } = await render(<Probe />);
    expect(container.querySelector("label")?.textContent).toBe(en.search.label);
    expect(container.querySelector("button")?.textContent).toBe("en:0");
  });

  /**
   * 🟡1(R1) — **배선**을 잰다: 사전 파일이 있는데 운반체 줄을 en으로 둔 채면 red다. 사전이 들어오기 전에는 en을 기대한다.
   * (E7에서 "파일이 없으면 en" 갈래를 지워 대상을 `UI_LOCALES` 전부로 만든다.)
   */
  it.each(UI_LOCALES)("%s 화면은 그 언어의 사전을 받는다", async (uiLocale) => {
    seen = undefined;
    const { container } = await render(<Probe />, { uiLocale });
    expect(seen).toBe(await expected(uiLocale));
    expect(container.querySelector("button")?.textContent).toBe(`${uiLocale}:0`);
  });

  it("언어를 바꿔도 자식이 다시 마운트되지 않는다 — 입력값·상태·포커스가 남는다", async () => {
    const view = await render(<MessagesProvider uiLocale="en" timeZone="UTC"><Probe /></MessagesProvider>);
    const input = view.container.querySelector("input")!;
    const button = view.container.querySelector("button")!;
    input.value = "typed";
    await act(async () => button.click());
    input.focus();
    await view.rerender(<MessagesProvider uiLocale="ko" timeZone="UTC"><Probe /></MessagesProvider>);
    for (let tries = 0; view.container.querySelector("button")?.textContent !== "ko:1" && tries < 50; tries++) {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    }
    expect(view.container.querySelector("button")?.textContent).toBe("ko:1");
    expect(view.container.querySelector("input")).toBe(input);
    expect(input.value).toBe("typed");
    expect(document.activeElement).toBe(input);
    await view.rerender(<MessagesProvider uiLocale="en" timeZone="UTC"><Probe /></MessagesProvider>);
    expect(view.container.querySelector("input")).toBe(input);
    expect(view.container.querySelector("button")?.textContent).toBe("en:1");
    expect(view.container.querySelector("label")?.textContent).toBe(en.search.label);
  });
});

/**
 * 날짜 형 입구 (user-timezone C1 · design §4) — provider가 없으면 UTC. 시간대가 바뀌어도 트리는 다시 마운트되지 않고,
 * 같은 provider 값에서는 **같은 객체**를 돌려준다(호출마다 새 객체면 deps로 쓴 자리가 매 렌더 다시 돈다).
 */
describe("useDateStyle", () => {
  const styles: DateStyle[] = [];

  function StyleProbe() {
    const style = useDateStyle();
    const [clicks, setClicks] = useState(0);
    styles.push(style);
    return (
      <div>
        <input id="tz" defaultValue="" />
        <button type="button" onClick={() => setClicks((n) => n + 1)}>{`${style.uiLocale}:${style.timeZone}:${clicks}`}</button>
      </div>
    );
  }

  it("provider가 없으면 en·UTC다", async () => {
    styles.length = 0;
    const { container } = await render(<StyleProbe />);
    expect(container.querySelector("button")?.textContent).toBe("en:UTC:0");
  });

  it("provider의 시간대·언어를 돌려주고, 같은 값이면 같은 객체다", async () => {
    styles.length = 0;
    const view = await render(<MessagesProvider uiLocale="en" timeZone="Asia/Seoul"><StyleProbe /></MessagesProvider>);
    expect(styles.at(-1)).toEqual({ uiLocale: "en", timeZone: "Asia/Seoul" });
    const first = styles.at(-1);
    await act(async () => view.container.querySelector("button")!.click());
    expect(view.container.querySelector("button")?.textContent).toBe("en:Asia/Seoul:1");
    expect(styles.at(-1)).toBe(first);
    await view.rerender(<MessagesProvider uiLocale="en" timeZone="Asia/Seoul"><StyleProbe /></MessagesProvider>);
    expect(styles.at(-1)).toBe(first);
  });

  it("시간대를 바꿔도 자식이 다시 마운트되지 않는다 — 입력값·상태·포커스가 남는다", async () => {
    const view = await render(<MessagesProvider uiLocale="en" timeZone="UTC"><StyleProbe /></MessagesProvider>);
    const input = view.container.querySelector("input")!;
    input.value = "typed";
    await act(async () => view.container.querySelector("button")!.click());
    input.focus();
    await view.rerender(<MessagesProvider uiLocale="en" timeZone="America/New_York"><StyleProbe /></MessagesProvider>);
    expect(view.container.querySelector("button")?.textContent).toBe("en:America/New_York:1");
    expect(view.container.querySelector("input")).toBe(input);
    expect(input.value).toBe("typed");
    expect(document.activeElement).toBe(input);
  });
});
