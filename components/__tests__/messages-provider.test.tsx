// @vitest-environment jsdom
import { existsSync } from "node:fs";
import { join } from "node:path";

import { act, useState } from "react";
import { describe, expect, it } from "vitest";

import { MessagesProvider, useMessages, useUiLocale } from "@/components/i18n/messages-provider";
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

/** 이 언어 화면이 받아야 할 사전 — 사전 파일이 있으면 그 export, 없으면(들어오기 전) en. */
async function expected(uiLocale: UiLocale): Promise<Messages> {
  if (uiLocale === "en" || !existsSync(join(ROOT, "messages", `${uiLocale}.tsx`))) return en;
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
    const view = await render(<MessagesProvider uiLocale="en"><Probe /></MessagesProvider>);
    const input = view.container.querySelector("input")!;
    const button = view.container.querySelector("button")!;
    input.value = "typed";
    await act(async () => button.click());
    input.focus();
    await view.rerender(<MessagesProvider uiLocale="ko"><Probe /></MessagesProvider>);
    for (let tries = 0; view.container.querySelector("button")?.textContent !== "ko:1" && tries < 50; tries++) {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    }
    expect(view.container.querySelector("button")?.textContent).toBe("ko:1");
    expect(view.container.querySelector("input")).toBe(input);
    expect(input.value).toBe("typed");
    expect(document.activeElement).toBe(input);
    await view.rerender(<MessagesProvider uiLocale="en"><Probe /></MessagesProvider>);
    expect(view.container.querySelector("input")).toBe(input);
    expect(view.container.querySelector("button")?.textContent).toBe("en:1");
    expect(view.container.querySelector("label")?.textContent).toBe(en.search.label);
  });
});
