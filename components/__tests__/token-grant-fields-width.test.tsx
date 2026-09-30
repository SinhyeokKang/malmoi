// @vitest-environment jsdom
import { expect, it } from "vitest";

import { initialGrantFields, TokenGrantFields } from "@/components/mcp/token-grant-fields";

import { render } from "./helpers/dom";

/**
 * **만료 선택의 폭** (2026-09-30 사용자) — 토큰 발급 모달(2열)과 OAuth 동의 화면(1열) 모두 폭을 채운다(모달의 360 고정을 같은 날 걷었다).
 * 동의 쪽은 `oauth-consent.test.tsx`가 호스트째로 잰다.
 */
const expiry = () => document.querySelector('[role="radiogroup"][aria-label="Expires in"]');
const value = initialGrantFields({ grants: [], scope: "all", projectIds: [] }, []);

it("모달(2열)도 폭을 채운다", async () => {
  await render(<TokenGrantFields value={value} onChange={() => {}} projects={[]} disabled={false} />);
  expect(expiry()?.className.split(" ")).toContain("w-full");
  expect(expiry()?.className).not.toContain("w-[360px]");
});

it("동의 화면(1열)은 폼 폭을 채운다", async () => {
  await render(<TokenGrantFields value={value} onChange={() => {}} projects={[]} disabled={false} columns={1} />);
  expect(expiry()?.className.split(" ")).toContain("w-full");
  expect(expiry()?.className).not.toContain("w-[360px]");
});
