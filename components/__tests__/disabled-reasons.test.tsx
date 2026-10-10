// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { DisabledReasons, useDisabledReasons } from "@/components/ui/disabled-reasons";
import { Button } from "@/components/ui/button";

import { render } from "./helpers/dom";

/**
 * 꺼진 컨트롤의 **보이는 사유 줄** (responsive-app design §3 · 시안 AT8a · 2026-10-11 사용자 F7 — 모든 폭).
 * 버튼은 `aria-disabled` + `aria-describedby`로 줄을 가리키고 `title`·sr-only를 들지 않는다 — 터치에 hover가 없다.
 * 원인이 같으면(같은 문장) 줄 하나를 함께 가리키고, 다르면 버튼 순서대로 한 줄씩 쌓는다.
 */
function Toolbar({ texts }: { texts: (string | null)[] }) {
  const { ids, reasons } = useDisabledReasons(texts);
  return (
    <div>
      {texts.map((text, index) => (
        <Button key={index} aria-disabled={text !== null ? "true" : undefined} aria-describedby={ids[index]}>{`b${index}`}</Button>
      ))}
      <DisabledReasons reasons={reasons} />
    </div>
  );
}
const describedText = (button: Element) => (button.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean).map(id => document.getElementById(id)?.textContent).join(" | ");

describe("DisabledReasons", () => {
  it("원인이 같으면 줄 하나 — 두 버튼이 같은 줄을 가리킨다", async () => {
    const { container } = await render(<Toolbar texts={["Disconnected.", "Disconnected."]} />);
    const lines = container.querySelectorAll("[data-disabled-reasons] > *");
    expect(lines).toHaveLength(1);
    const [a, b] = [...container.querySelectorAll("button")];
    expect(a!.getAttribute("aria-describedby")).toBe(b!.getAttribute("aria-describedby"));
    expect(describedText(a!)).toBe("Disconnected.");
  });

  it("원인이 다르면 버튼 순서대로 한 줄씩이다", async () => {
    const { container } = await render(<Toolbar texts={["Wait for Publish to finish.", "Nothing to send."]} />);
    expect([...container.querySelectorAll("[data-disabled-reasons] > *")].map(node => node.textContent)).toEqual(["Wait for Publish to finish.", "Nothing to send."]);
    const [a, b] = [...container.querySelectorAll("button")];
    expect(describedText(a!)).toBe("Wait for Publish to finish.");
    expect(describedText(b!)).toBe("Nothing to send.");
  });

  it("켜진 버튼은 줄도 describedby도 없다 — 하나도 꺼지지 않았으면 아무것도 그리지 않는다", async () => {
    const { container } = await render(<Toolbar texts={[null, "Nothing to send."]} />);
    const [a] = [...container.querySelectorAll("button")];
    expect(a!.hasAttribute("aria-describedby")).toBe(false);
    expect(container.querySelectorAll("[data-disabled-reasons] > *")).toHaveLength(1);
    const empty = await render(<Toolbar texts={[null, null]} />);
    expect(empty.container.querySelector("[data-disabled-reasons]")).toBeNull();
  });

  it("보이는 줄이다 — sr-only도 title도 아니고, 작은 muted 글자로 오른쪽 끝에 선다", async () => {
    const { container } = await render(<Toolbar texts={["Disconnected."]} />);
    const block = container.querySelector<HTMLElement>("[data-disabled-reasons]")!;
    const line = block.firstElementChild!;
    expect(line.classList.contains("sr-only")).toBe(false);
    for (const token of ["text-xs", "text-muted-foreground", "text-right"]) expect(line.classList.contains(token)).toBe(true);
    expect(block.classList.contains("items-end")).toBe(true);
    expect(container.querySelector("[title]")).toBeNull();
  });
});
