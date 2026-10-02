// @vitest-environment jsdom
import { expect, it } from "vitest";

import { Alert } from "@/components/ui/alert";

import { render } from "./helpers/dom";

const TONES = ["neutral", "info", "success", "warning", "danger"] as const;
const tokens = (el: Element | null | undefined) => (el?.getAttribute("class") ?? "").split(/\s+/);

/**
 * **색은 배경과 글리프만 든다** (2026-09-29 사용자) — 테두리가 없고, 글자는 tone과 무관하게 본문 색이다.
 * 전엔 danger만 제목·본문이 빨갛고 warning만 amber-900이라 tone마다 글자 규칙이 달랐다.
 */
it.each(TONES)("%s — 테두리 없이 배경 하나이고 글자에 색이 없다", async (tone) => {
  const { container } = await render(<Alert variant={tone} title="Title">Body</Alert>);
  const root = container.querySelector("[data-alert]");
  expect(root?.getAttribute("data-alert")).toBe(tone);
  expect(tokens(root).filter(token => /^border/.test(token))).toEqual([]);
  expect(tokens(root).filter(token => /^text-(?!sm$|xs$)/.test(token))).toEqual([]);
  expect(tokens(root).some(token => token.startsWith("bg-"))).toBe(true);
});

it("tone마다 배경과 글리프 색이 갈린다", async () => {
  const { container } = await render(<>{TONES.map(tone => <Alert key={tone} variant={tone}>x</Alert>)}</>);
  const roots = [...container.querySelectorAll("[data-alert]")];
  const bg = roots.map(root => tokens(root).find(token => token.startsWith("bg-")));
  const glyph = roots.map(root => tokens(root.querySelector("svg")).find(token => token.startsWith("text-")));
  expect(bg).toEqual(["bg-muted", "bg-blue-50", "bg-green-50", "bg-amber-50", "bg-red-50"]);
  expect(glyph).toEqual(["text-muted-foreground", "text-link", "text-green-800", "text-amber-700", "text-destructive"]);
});

/** 알림 방식은 tone이 아니라 `live`가 정한다 — 기본값만 tone에서 온다(danger는 끼어든다). */
it("live — danger 기본은 alert, 나머지는 없음, 명시하면 그것이 이긴다", async () => {
  const { container } = await render(<>
    <Alert variant="danger">a</Alert>
    <Alert variant="warning">b</Alert>
    <Alert variant="success" live="status">c</Alert>
    <Alert variant="danger" live="off">d</Alert>
  </>);
  expect([...container.querySelectorAll("[data-alert]")].map(root => root.getAttribute("role"))).toEqual(["alert", null, "status", null]);
});

it("size — compact는 radius 10 · padding 12 · 13px · 글리프 14다", async () => {
  const { container } = await render(<><Alert>a</Alert><Alert size="sm">b</Alert></>);
  const [normal, compact] = [...container.querySelectorAll("[data-alert]")];
  expect(tokens(normal)).toEqual(expect.arrayContaining(["rounded-lg", "p-4", "gap-3", "text-sm"]));
  expect(tokens(compact)).toEqual(expect.arrayContaining(["rounded-md", "p-3", "gap-2", "text-xs"]));
  expect(tokens(compact?.querySelector("svg"))).toContain("size-3.5");
  expect(tokens(normal?.querySelector("svg"))).toContain("size-4");
});

it("inset — 카드에 붙는 띠라 radius가 없고 선도 없다", async () => {
  const { container } = await render(<Alert inset variant="danger">x</Alert>);
  const root = container.querySelector("[data-alert]");
  expect(tokens(root)).toEqual(expect.arrayContaining(["rounded-none", "px-4", "py-row-y"]));
  expect(tokens(root).filter(token => /^border/.test(token))).toEqual([]);
});

/**
 * ⚠️ **닫기 버튼이 행 높이를 키우지 않는다** — 36 정방에 위쪽만 −8이면 한 줄 Alert의 행이 글자(21)가 아니라
 * 버튼(28)으로 잡혀 제목 아래가 7px 넓었다(2026-09-29 사용자 — Home의 `Synced …`).
 */
it("닫기는 위아래 모두 −8이다", async () => {
  const { container } = await render(<Alert title="Synced" onDismiss={() => {}} />);
  expect(tokens(container.querySelector("button"))).toEqual(expect.arrayContaining(["-my-2", "-mr-2", "size-9"]));
});

it("id가 루트에 선다 — 다른 컨트롤의 aria-describedby 대상이 된다", async () => {
  const { container } = await render(<Alert id="warning">x</Alert>);
  expect(container.querySelector("[data-alert]")?.id).toBe("warning");
});

/** 제목↔본문은 기본 4 · compact 2다(2026-09-30 사용자) — 열 gap(8 · 6)에서 제목이 −4를 당긴다. 본문이 없으면 당기지 않는다(액션과의 간격이 줄지 않게). */
it("제목은 본문이 있을 때만 -mb-1로 붙는다", async () => {
  const withBody = (await render(<Alert title="Title">Body</Alert>)).container;
  expect(withBody.querySelector("p.font-medium")?.className).toContain("-mb-1");
  const titleOnly = (await render(<Alert title="Synced" />)).container;
  expect(titleOnly.querySelector("p.font-medium")?.className).not.toContain("-mb-1");
});

it("명시적 md는 기본 크기의 클래스·본문 간격과 같다", async () => {
  const { container } = await render(<><Alert title="Title">Body</Alert><Alert size="md" title="Title">Body</Alert></>);
  const [implicit, explicit] = [...container.querySelectorAll("[data-alert]")];
  expect(explicit?.outerHTML).toBe(implicit?.outerHTML);
});
