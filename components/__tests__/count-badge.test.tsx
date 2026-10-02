// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { CountBadge } from "@/components/ui/count-badge";
import { Card } from "@/components/ui/card";

import { render } from "./helpers/dom";

/**
 * **개수 배지는 0이면 서지 않고, 숫자는 `aria-hidden` + sr 문장이다** (DESIGN §6.4 · ux-drift-unify T12 · spec Q13).
 * 0을 배지로 세우면 하나의 항목처럼 읽히고, 숫자만 낭독하면 접근 이름이 "Members 3"이 된다.
 */
describe("CountBadge", () => {
  it("0이면 아무것도 그리지 않는다", async () => {
    const { container } = await render(<CountBadge count={0} label="0 sources" />);
    expect(container.innerHTML).toBe("");
  });

  it("숫자는 aria-hidden이고 sr 문장이 짝이다", async () => {
    const { container } = await render(<CountBadge count={1234} label="1,234 keys" />);
    const pill = container.firstElementChild!;
    expect(pill.className).toContain("rounded-full");
    expect(pill.className).toContain("bg-foreground/5");
    expect(pill.querySelector('[aria-hidden="true"]')?.textContent).toBe("1,234");
    expect(pill.querySelector(".sr-only")?.textContent).toBe("1,234 keys");
  });
});

describe("카드 머리의 count prop", () => {
  it("Card — 0이면 머리에 배지가 없고, 있으면 제목 바로 다음이다", async () => {
    const zero = (await render(<Card title="Sources" count={0} countLabel="0 sources"><p>x</p></Card>)).container;
    expect(zero.querySelector("h2 + span")).toBeNull();
    const two = (await render(<Card title="Sources" count={2} countLabel="2 sources"><p>x</p></Card>)).container;
    expect(two.querySelector("h2 + span")?.querySelector(".sr-only")?.textContent).toBe("2 sources");
  });

  it("Card — 0이면 머리에 배지가 없다", async () => {
    const zero = (await render(<Card title="Pending" count={0} countLabel="0 invitations"><ul /></Card>)).container;
    expect(zero.querySelector("h2 + span")).toBeNull();
    const one = (await render(<Card title="Pending" count={1} countLabel="1 invitation"><ul /></Card>)).container;
    expect(one.querySelector("h2 + span")?.querySelector(".sr-only")?.textContent).toBe("1 invitation");
  });
});

/** 개수와 sr 문장은 짝이다 — 문장 없는 개수는 타입에서 막힌다(U3 r1: 빈 문장으로 배지가 섰다). */
it("count만 넘기고 countLabel을 빼면 타입 오류다", () => {
  // @ts-expect-error — countLabel이 없다.
  const card = <Card title="Sources" count={2}><p>x</p></Card>;
  // @ts-expect-error — countLabel이 없다.
  const row = <Card title="Pending" count={1}><ul /></Card>;
  expect([card, row]).toHaveLength(2);
});
