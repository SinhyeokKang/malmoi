// @vitest-environment jsdom
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import { render } from "@/components/__tests__/helpers/dom";
import { m } from "@/lib/i18n";

import RootError from "../error";
import GlobalError from "../global-error";
import RootNotFound from "../not-found";

/**
 * **셸 밖 라우트의 오타·예외가 Next 기본 페이지로 떨어지지 않는다** (audit #17). `/invite`·`/signin`·`/signin/link`는
 * `(edit)` 그룹 밖이라 그 그룹의 `error.tsx`가 닿지 않고, 루트에는 경계가 0이었다 — 영문 기본 404와 흰 화면
 * *"Application error"* 가 제품 문구·출구 없이 섰다.
 */
it("루트 not-found는 제품 문구와 목록 출구를 든다", () => {
  const html = renderToStaticMarkup(<RootNotFound />);
  expect(html).toContain(m.notFound.title);
  expect(html).toContain('href="/projects"');
});

it("루트 error는 다시 시도(reset)와 목록 출구를 든다", async () => {
  const reset = vi.fn();
  const { container } = await render(<RootError error={new Error("boom")} reset={reset} />);
  expect(container.textContent).toContain(m.crash.title);
  expect(container.textContent).not.toContain("boom");
  expect(container.querySelector('a[href="/projects"]')).not.toBeNull();
  const retry = [...container.querySelectorAll("button")].find(b => b.textContent?.trim() === m.common.retry);
  await act(async () => retry?.click());
  expect(reset).toHaveBeenCalledOnce();
});

it("global-error는 루트 레이아웃을 대신하므로 html·body를 스스로 든다", () => {
  const html = renderToStaticMarkup(<GlobalError error={new Error("boom")} reset={() => {}} />);
  expect(html.startsWith("<html")).toBe(true);
  expect(html).toContain("<body");
  expect(html).toContain(m.crash.title);
  expect(html).not.toContain("boom");
});
