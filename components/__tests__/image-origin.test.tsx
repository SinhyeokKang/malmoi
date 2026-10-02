// @vitest-environment jsdom
import { act } from "react";
import { expect, it } from "vitest";

import { Avatar } from "@/components/ui/avatar";
import { ImageTile } from "@/components/ui/image-tile";

import { find, render } from "./helpers/dom";

/**
 * **브라우저가 Blob 호스트를 보지 않는다** (2026-09-28).
 *
 * ⚠️ 기업 웹 필터가 `*.vercel-storage.com`을 막고 TLS를 자기 CA로 가로채면, 그 망의 브라우저는
 * 업로드한 사진에서 `ERR_CERT_AUTHORITY_INVALID`를 받고 **업로드가 실패한 것처럼 보인다**(폴백이
 * 조용하다). 읽기는 `next.config.ts`의 rewrite로 자사 출처를 지난다.
 *
 * ⚠️ **이 그물이 규칙을 잎 둘에 붙잡아 둔다** (POSTMORTEM 2026-09-20 — "규칙의 소비자가 몇인가").
 * `Project.image`·`User.image`를 읽는 자리가 십여 곳인데, 매핑을 호출자마다 적으면 새 화면이
 * 하나 생길 때마다 이 규칙이 조용히 빠진다. 매핑은 `useImageFallback` 하나에 있고 소비자는 둘이다.
 */
const BLOB = "https://store.public.blob.vercel-storage.com";

it("`Avatar`가 Blob URL을 자사 출처 경로로 그린다", async () => {
  const { container } = await render(<Avatar name="sinhyeok" src={`${BLOB}/avatars/u1/n1.webp`} />);
  const src = find<HTMLImageElement>(container, "img").getAttribute("src");
  expect(src).toBe("/api/images/avatars/u1/n1.webp");
  expect(src).not.toContain("blob.vercel-storage.com");
});

it("`ImageTile`이 Blob URL을 자사 출처 경로로 그린다", async () => {
  const { container } = await render(<ImageTile src={`${BLOB}/projects/p1/n1.webp`} fallback={<span>M</span>} />);
  const src = find<HTMLImageElement>(container, "img").getAttribute("src");
  expect(src).toBe("/api/images/projects/p1/n1.webp");
  expect(src).not.toContain("blob.vercel-storage.com");
});

/** 공급자 아바타는 핫링크 그대로다 — 우리 객체가 아니라 rewrite가 받을 키가 없다. */
it("공급자 사진은 매핑하지 않는다", async () => {
  const { container } = await render(<Avatar name="sinhyeok" src="https://lh3.googleusercontent.com/a/1" />);
  expect(find<HTMLImageElement>(container, "img").getAttribute("src")).toBe("https://lh3.googleusercontent.com/a/1");
});

/**
 * ⚠️ **실패 기억은 매핑된 `src`로 비교돼야 한다** — 기억한 값과 그리는 값이 다르면 실패한 사진이
 * 매 렌더 다시 선다(malmoi#50의 폴백이 무력해진다).
 */
it("매핑된 사진이 실패하면 폴백으로 떨어지고, 사진을 바꾸면 다시 시도한다", async () => {
  const view = await render(<Avatar name="sinhyeok" src={`${BLOB}/avatars/u1/n1.webp`} />);
  await act(async () => { find(view.container, "img").dispatchEvent(new Event("error")); });
  expect(view.container.querySelector("img")).toBeNull();
  expect(view.container.textContent).toBe("S");

  await view.rerender(<Avatar name="sinhyeok" src={`${BLOB}/avatars/u1/n2.webp`} />);
  expect(find<HTMLImageElement>(view.container, "img").getAttribute("src")).toBe("/api/images/avatars/u1/n2.webp");
});
