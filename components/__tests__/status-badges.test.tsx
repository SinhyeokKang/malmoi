// @vitest-environment jsdom
import { expect, it } from "vitest";

import { MetaColumn } from "@/components/home/meta-column";
import { LocaleMeter } from "@/components/locale-meter";
import { ResultBadge } from "@/components/logs/result-badge";
import { GrantBadges } from "@/components/mcp/grant-badges";

import { render } from "./helpers/dom";

/** 결과는 셋 다 배지다(2026-09-30 사용자) — 무색 neutral · 보류 warning · 실패는 붉은 면(`missing` — §2.3 조합). */
it.each([
  ["muted", "bg-foreground/5"],
  ["warning", "bg-amber-100/80"],
  ["danger", "bg-destructive/8"],
] as const)("ResultBadge %s → %s 알약", async (tone, face) => {
  const { container } = await render(<ResultBadge tone={tone} label="x" />);
  const pill = container.firstElementChild!;
  expect(pill.className).toContain("rounded-full");
  expect(pill.className).toContain(face);
});

/** 권한마다 배지 하나 — 없으면 `Read only` 하나. 만료면 흐리다. */
it("GrantBadges — 권한마다 하나, 없으면 Read only, 만료면 흐리다", async () => {
  const two = (await render(<GrantBadges grants={["translation:write", "member:manage"]} />)).container;
  expect([...two.querySelectorAll(".rounded-full")].map((b) => b.textContent)).toEqual(["Translate & publish", "Members"]);
  const none = (await render(<GrantBadges grants={[]} dimmed />)).container;
  const pills = [...none.querySelectorAll(".rounded-full")];
  expect(pills.map((b) => b.textContent)).toEqual(["Read only"]);
  expect(pills[0]!.className).toContain("text-neutral-400");
});

/** 국기 + 코드는 배지 하나다(2026-09-30 사용자) — 프로젝트 행 Meter 머리와 Home 메타 열 Languages가 같은 모양이다. */
it("로케일 국기 + 코드가 배지 하나로 선다 — 목록 Meter · Home 메타", async () => {
  const meter = (await render(<LocaleMeter locale={{ surfaceSlug: "s", code: "fr", isBase: false, total: 10, done: 5, review: 0, percent: 50 }} />)).container;
  const pill = meter.querySelector(".rounded-full");
  expect(pill?.textContent).toBe("fr");
  expect(pill?.querySelector("[data-locale-flag], span, img")).not.toBeNull();
  const meta = (await render(<MetaColumn slug="acme" now={new Date()} canOpenSettings={false} rows={[{ kind: "locales", codes: ["en", "ko"] }]} />)).container;
  expect([...meta.querySelectorAll("dd .rounded-full")].map((b) => b.textContent)).toEqual(["en", "ko"]);
});
