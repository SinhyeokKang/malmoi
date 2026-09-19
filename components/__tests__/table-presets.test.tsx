// @vitest-environment jsdom
import { expect, it } from "vitest";

import { Table, TableBody, TableHeader, Td, Th, Tr } from "@/components/ui/table";

import { find, render } from "./helpers/dom";

/**
 * `Th`·`Td`·`Tr`은 shadcn 프리미티브 위의 **프리셋**이고 별도 구현이 아니다 (2026-09-12).
 *
 * ⚠️ **되눌림이 `cn`(tailwind-merge)에 달려 있다** — 프리미티브 기본값에 `whitespace-nowrap`·
 * `align-middle`·`border-b`가 있어서, 그것이 안 지워지면 언어·이력·멤버 표가 **조용히** 달라진다
 * (긴 사유가 한 줄로 늘어나 가로 스크롤이 나고, 마지막 행 아래에 선이 하나 더 선다).
 * 클래스 문자열은 렌더 결과로만 확인되므로 여기서 실제로 렌더해 잰다.
 */
async function cells() {
  const { container } = await render(
    <Table>
      <TableHeader>
        <tr><Th>When</Th></tr>
      </TableHeader>
      <TableBody>
        <Tr><Td>reason</Td></Tr>
      </TableBody>
    </Table>,
  );
  return {
    th: find<HTMLElement>(container, "th"),
    td: find<HTMLElement>(container, "td"),
    tr: find<HTMLElement>(container, "tbody tr"),
  };
}

it("프리셋이 프리미티브를 감싼다 — 마크업이 한 곳에서 나온다", async () => {
  const { th, td, tr } = await cells();
  expect(th.dataset.slot).toBe("table-head");
  expect(td.dataset.slot).toBe("table-cell");
  expect(tr.dataset.slot).toBe("table-row");
});

it("Th가 되눌러야 할 기본값을 실제로 덮는다", async () => {
  const { th } = await cells();
  for (const cls of ["sticky", "top-0", "z-10", "h-auto", "px-4", "py-2", "whitespace-normal", "bg-muted/50", "text-foreground/60"]) {
    expect(th.classList.contains(cls), cls).toBe(true);
  }
  for (const cls of ["h-10", "px-2", "whitespace-nowrap", "text-foreground"]) {
    expect(th.classList.contains(cls), cls).toBe(false);
  }
});

it("Td가 긴 문장을 접을 수 있게 nowrap을 벗는다", async () => {
  const { td } = await cells();
  for (const cls of ["border-t", "px-4", "py-3", "align-top", "whitespace-normal"]) {
    expect(td.classList.contains(cls), cls).toBe(true);
  }
  for (const cls of ["px-2", "py-2", "align-middle", "whitespace-nowrap"]) {
    expect(td.classList.contains(cls), cls).toBe(false);
  }
});

it("Tr이 행 구분선을 Td에 맡긴다 — 선이 두 번 그려지지 않는다", async () => {
  const { tr } = await cells();
  expect(tr.classList.contains("border-b-0")).toBe(true);
  expect(tr.classList.contains("border-b")).toBe(false);
  expect(tr.classList.contains("hover:bg-muted/30")).toBe(true);
  expect(tr.classList.contains("hover:bg-muted/50")).toBe(false);
});

it("스크롤 컨테이너는 기본이고 끄는 곳이 둘이다 — 번역 화면과 온보딩 ②", async () => {
  const { container } = await render(<Table><TableBody><tr><td>x</td></tr></TableBody></Table>);
  expect(find<HTMLElement>(container, "div").className).toContain("overflow-auto");

  const plain = await render(<Table scrollable={false}><TableBody><tr><td>x</td></tr></TableBody></Table>);
  expect(plain.container.firstElementChild?.tagName).toBe("TABLE");
});
