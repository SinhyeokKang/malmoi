// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { STATE, type StateKey } from "@/lib/status/canon";

import { render } from "./helpers/dom";

/**
 * **상태 배지는 상태 키 하나만 받는다** (DESIGN §2.4 · ux-drift-unify T11) — variant와 낱말이 `STATE`에서 온다.
 * 호출부가 variant를 고르는 자리가 사라지는 것이 요지라, 기대값을 손으로 적지 않고 같은 표에서 뽑은 `Badge`와 비교한다.
 */
describe("StatusBadge", () => {
  const keys = Object.keys(STATE) as StateKey[];

  it("표의 키를 전부 돈다", () => {
    expect(keys.length).toBeGreaterThan(10);
  });

  it.each(keys)("%s → STATE의 variant + 낱말", async (key) => {
    const shown = (await render(<StatusBadge state={key} />)).container.firstElementChild!;
    const expected = (await render(<Badge variant={STATE[key].variant}>{STATE[key].label}</Badge>)).container.firstElementChild!;
    expect(shown.className).toBe(expected.className);
    expect(shown.textContent).toBe(STATE[key].label);
  });

  it("className은 배치만 덧댄다 — variant 면은 그대로다", async () => {
    const shown = (await render(<StatusBadge state="syncFailed" className="shrink-0" />)).container.firstElementChild!;
    expect(shown.className).toContain("shrink-0");
    expect(shown.className).toContain("bg-destructive/8");
  });

  /**
   * **사라진 언어도 `soft-red` 하나다** (D3②) — 면 없는 붉은 글자 `danger`는 소비자가 로케일 배지 하나라 지웠다.
   * `soft-red`에는 글리프 간격이 없다 — 배지 안에 글리프를 넣지 않는다(§2.4).
   */
  it("Badge에 danger variant가 없고, soft-red에 글리프 간격이 없다", async () => {
    // @ts-expect-error — D3②로 지운 variant다. 되살리면 이 줄이 typecheck에서 red다.
    const gone = (await render(<Badge variant="danger">x</Badge>)).container.firstElementChild!;
    expect(gone.className).not.toContain("text-destructive");
    const missing = (await render(<Badge variant="soft-red">x</Badge>)).container.firstElementChild!;
    expect(missing.className).not.toContain("gap-1.5");
  });
});

/**
 * **STATE 키가 있는 상태를 `Badge`로 직접 그리지 않는다** (ux-drift-unify — U11 핸드오프). PR `Open`(`prOpen`)·보관(`archived`)이
 * 마지막 직접 소비자였다 — 직접 쓰면 variant·낱말을 호출부가 다시 고르고, 표가 바뀔 때 그 자리만 낡는다.
 */
describe("마지막 직접 상태 배지", () => {
  it.each([
    ["components/publish-button.tsx", "prOpen", "p.prState"],
    ["components/shell/project-switcher.tsx", "archived", "m.projects.status.archived"],
  ])("%s가 %s를 StatusBadge로 그린다", (path, key, label) => {
    const source = readFileSync(join(process.cwd(), path), "utf8");
    expect(source).toContain(`<StatusBadge state="${key}"`);
    expect(source).not.toMatch(new RegExp(`<Badge\\b[^>]*>\\s*\\{${label.replace(/\./g, "\\.")}\\}`));
  });
});

// 타입 계약: 상태 낱말·모양을 호출부에서 덮어쓸 통로가 없어야 한다.
function rejectedStatusProps() {
  // @ts-expect-error — 상태는 variant를 받지 않는다.
  return <StatusBadge state="synced" variant="soft-red" />;
}
function rejectedStatusLabel() {
  // @ts-expect-error — 상태는 임의 라벨을 받지 않는다.
  return <StatusBadge state="synced" label="Different" />;
}
void rejectedStatusProps;
void rejectedStatusLabel;
