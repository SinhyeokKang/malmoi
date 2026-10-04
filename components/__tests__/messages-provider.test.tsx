// @vitest-environment jsdom
import { act, useState } from "react";
import { describe, expect, it } from "vitest";

import { MessagesProvider, useMessages, useUiLocale } from "@/components/i18n/messages-provider";
import { UI_DICTIONARIES } from "@/components/i18n/ui-dictionaries";
import type { Messages } from "@/lib/i18n";
import { en } from "@/messages/en";

import { render } from "./helpers/dom";

/**
 * 클라이언트 사전 입구 (ui-locales tasks D1). provider가 없으면 en이고, 언어를 바꿔도 **같은 트리가 새 문구로 다시 그려진다** —
 * 재마운트되면 컨트롤의 포커스·상태가 사라진다(design §4).
 */
const ko = { ...en, search: { ...en.search, label: "검색" } } as Messages;

function Probe() {
  const m = useMessages();
  const uiLocale = useUiLocale();
  const [clicks, setClicks] = useState(0);
  return (
    <div>
      <label htmlFor="probe">{m.search.label}</label>
      <input id="probe" defaultValue="" />
      <button type="button" onClick={() => setClicks((n) => n + 1)}>{`${uiLocale}:${clicks}`}</button>
    </div>
  );
}

describe("MessagesProvider", () => {
  it("provider가 없으면 en이다 — global-error와 기존 DOM 테스트가 그대로 돈다", async () => {
    const { container } = await render(<Probe />);
    expect(container.querySelector("label")?.textContent).toBe(en.search.label);
    expect(container.querySelector("button")?.textContent).toBe("en:0");
  });

  it("provider가 준 사전과 화면 언어를 읽는다", async () => {
    const { container } = await render(<MessagesProvider uiLocale="ko" messages={ko}><Probe /></MessagesProvider>);
    expect(container.querySelector("label")?.textContent).toBe("검색");
    expect(container.querySelector("button")?.textContent).toBe("ko:0");
  });

  it("언어를 바꿔도 자식이 다시 마운트되지 않는다 — 입력값·상태·포커스가 남는다", async () => {
    const view = await render(<MessagesProvider uiLocale="en" messages={en}><Probe /></MessagesProvider>);
    const input = view.container.querySelector("input")!;
    const button = view.container.querySelector("button")!;
    input.value = "typed";
    await act(async () => button.click());
    input.focus();
    await view.rerender(<MessagesProvider uiLocale="ko" messages={ko}><Probe /></MessagesProvider>);
    expect(view.container.querySelector("input")).toBe(input);
    expect(input.value).toBe("typed");
    expect(document.activeElement).toBe(input);
    expect(view.container.querySelector("button")?.textContent).toBe("ko:1");
    expect(view.container.querySelector("label")?.textContent).toBe("검색");
  });
});

describe("render의 uiLocale 옵션", () => {
  it("그 언어의 사전 표(UI_DICTIONARIES)로 감싼다", async () => {
    const { container } = await render(<Probe />, { uiLocale: "es" });
    expect(container.querySelector("button")?.textContent).toBe("es:0");
    expect(container.querySelector("label")?.textContent).toBe(UI_DICTIONARIES.es.search.label);
  });
});
