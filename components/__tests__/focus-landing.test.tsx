// @vitest-environment jsdom
import { act, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { focusLost, landFocus, neighbourFocus, useLandAfter } from "@/components/ui/focus";

import { render } from "./helpers/dom";

/**
 * **포커스 착지** (audit #32·#35). 누른 컨트롤이 꺼지거나 사라지면 브라우저가 포커스를 `body`로 떨어뜨린다 —
 * 그 뒤 첫 Tab이 페이지 맨 위에서 시작하고 스크린리더는 읽던 자리를 잃는다.
 *
 * ⚠️ **"빠졌을 때만" 옮긴다** — 사용자가 그 사이 다른 곳으로 옮겼으면 건드리지 않는다. jsdom에는 focus fixup이
 * 없어 꺼진 버튼이 `activeElement`로 남으므로, `:disabled` 위의 포커스도 빠진 것으로 센다.
 */
afterEach(() => { document.body.innerHTML = ""; });

function button(label: string, disabled = false) {
  const node = document.createElement("button");
  node.textContent = label;
  node.disabled = disabled;
  document.body.append(node);
  return node;
}

describe("focusLost", () => {
  it("body · 꺼진 노드 · 떨어진 노드 위의 포커스를 빠진 것으로 센다", () => {
    expect(focusLost()).toBe(true);
    const save = button("Save");
    save.focus();
    expect(focusLost()).toBe(false);
    save.disabled = true;
    expect(focusLost()).toBe(true);
  });
});

describe("landFocus", () => {
  it("후보 중 붙어 있고 켜진 첫 요소로 옮긴다", () => {
    const off = button("Save", true);
    const field = document.createElement("input");
    document.body.append(field);
    expect(landFocus(off, null, field)).toBe(field);
    expect(document.activeElement).toBe(field);
  });

  it("포커스가 살아 있으면 옮기지 않는다 — 짝으로, 빠졌으면 옮긴다", () => {
    const other = button("Other");
    const target = button("Target");
    other.focus();
    expect(landFocus(target)).toBeNull();
    expect(document.activeElement).toBe(other);
    other.remove();
    expect(landFocus(target)).toBe(target);
    expect(document.activeElement).toBe(target);
  });
});

describe("neighbourFocus", () => {
  it("노드 뒤의 첫 포커스 가능 요소, 없으면 앞의 마지막 요소", () => {
    const before = button("Before");
    const alert = document.createElement("div");
    alert.append(Object.assign(document.createElement("button"), { textContent: "Dismiss" }));
    document.body.append(alert);
    const hidden = button("Hidden");
    hidden.tabIndex = -1;
    const after = button("After");
    expect(neighbourFocus(alert)).toBe(after);
    after.remove();
    expect(neighbourFocus(alert)).toBe(before);
  });
});

describe("useLandAfter", () => {
  function Probe() {
    const [pending, setPending] = useState(false);
    const [done, setDone] = useState(false);
    useLandAfter(pending, () => document.getElementById("field"));
    return <>
      <input id="field" />
      <button id="save" disabled={pending || done} onClick={() => setPending(true)}>Save</button>
      <button id="finish" onClick={() => { setPending(false); setDone(true); }}>Finish</button>
    </>;
  }

  it("pending이 끝난 커밋 뒤에 착지한다 — 시작만으로는 옮기지 않는다", async () => {
    await render(<Probe />);
    const save = document.getElementById("save") as HTMLButtonElement;
    save.focus();
    await act(async () => { save.click(); });
    expect(document.activeElement).toBe(save);
    await act(async () => { (document.getElementById("finish") as HTMLButtonElement).click(); });
    // finish 클릭은 포커스를 옮기지 않으므로 여전히 꺼진 Save 위다 — 빠진 포커스다.
    expect(document.activeElement?.id).toBe("field");
  });
});
