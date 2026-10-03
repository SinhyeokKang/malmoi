// @vitest-environment jsdom
import { expect, it } from "vitest";

import { LocaleMeter } from "@/components/locale-meter";
import { LocaleBadge } from "@/components/translations/locale-badge";
import { m } from "@/lib/i18n";
import { StatusBadge } from "@/components/ui/status-badge";
import { GrantBadges } from "@/components/mcp/grant-badges";

import { render } from "./helpers/dom";

/** 결과는 셋 다 배지다(2026-09-30 사용자) — 무색 soft-neutral · 보류 soft-amber · 실패는 붉은 면(`soft-red` — §2.3 조합). */
it.each([
  ["logsSent", "Sent", "bg-foreground/5"],
  ["logsSynced", "Synced", "bg-foreground/5"],
  ["syncing", "Syncing…", "bg-foreground/5"],
  ["publishing", "Publishing…", "bg-foreground/5"],
  ["nothingToSend", "Nothing to send", "bg-foreground/5"],
  ["superseded", "Superseded", "bg-foreground/5"],
  ["upToDate", "Up to date", "bg-foreground/5"],
  ["heldBack", "Held back", "bg-amber-100/80"],
  ["held", "Held", "bg-amber-100/80"],
  ["partiallySynced", "Partially synced", "bg-amber-100/80"],
  ["notStarted", "Not started", "bg-amber-100/80"],
  ["logsFailed", "Failed", "bg-destructive/8"],
] as const)("StatusBadge %s의 낱말과 기존 면", async (state, label, face) => {
  const { container } = await render(<StatusBadge state={state} />);
  const pill = container.firstElementChild!;
  expect(pill.tagName).toBe("SPAN");
  expect(pill.textContent).toBe(label);
  expect(pill.querySelector("svg, time")).toBeNull();
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
  expect(pills[0]!.className).toContain("text-gray-dim");
});

/** 국기 + 코드는 배지 하나다(2026-09-30 사용자) — 프로젝트 행 Meter 머리. Home 메타 열의 Languages 행은 project-card-tabs가 걷었다(로케일은 Sources 상세가 든다). */
it("로케일 국기 + 코드가 배지 하나로 선다 — 목록 Meter", async () => {
  const meter = (await render(<LocaleMeter locale={{ surfaceSlug: "s", code: "fr", isBase: false, total: 10, done: 5, review: 0, percent: 50 }} />)).container;
  const pill = meter.querySelector(".rounded-full");
  expect(pill?.textContent).toBe("fr");
  expect(pill?.querySelector("[data-locale-flag], span, img")).not.toBeNull();
});

/** 상태가 로케일 코드·국기·접근 설명과 결합된 배지는 모양 축을 유지한다. */
it.each([false, true])("로케일 orphaned=%s도 코드·국기와 접근 설명을 보존한다", async (orphaned) => {
  const { container } = await render(<LocaleBadge code="fr" orphaned={orphaned} />);
  const pill = container.firstElementChild!;
  expect(pill.querySelector('[aria-hidden="true"]')).not.toBeNull();
  const visibleCode = [...pill.children].find(node => node.textContent === "fr");
  expect(visibleCode).toBeDefined();
  expect(visibleCode?.classList.contains("sr-only")).toBe(false);
  expect(pill.querySelector(".sr-only")?.textContent ?? null).toBe(orphaned ? m.locales.orphaned.badge : null);
  expect(pill.classList.contains(orphaned ? "bg-destructive/8" : "bg-foreground/5")).toBe(true);
  expect(pill.classList.contains("gap-1")).toBe(true);
});
