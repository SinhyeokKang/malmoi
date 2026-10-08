// @vitest-environment jsdom
import { expect, it } from "vitest";

import { AttentionCard } from "@/components/home/attention-card";
import { relativeTime } from "@/lib/relative-time";
import { en } from "@/messages/en";

import { render } from "./helpers/dom";

/**
 * inbox-page T3 — Home 카드가 공유 행 조각으로 옮겨 간 뒤에도 호출부가 판정한 값이 그대로 선다(D3).
 * 권한 판정은 Home 호출부(`item.kind === "import_failed" && !canPerform(role, "project:settings")`)에 남고, 공유 슬롯은 그 결과만 받는다.
 */
const now = new Date("2026-09-24T12:00:00Z");
const failed = { kind: "import_failed" as const, at: new Date("2026-09-24T11:00:00Z"), surfaceSlug: "web", reason: "import-failed" as const };
const review = { kind: "review" as const, at: new Date("2026-09-24T09:00:00Z"), surfaceSlug: "web", code: "ko", name: "Korean", count: 8, who: "Kim" };
const card = (role: "OWNER" | "EDITOR") =>
  render(<AttentionCard items={{ shown: [failed, review], more: [], count: 2 }} slug="acme" role={role} state="default" now={now} uiLocale="en" m={en} />);

it("EDITOR의 적재 실패 행에는 Owner 안내가 있고, 다른 종류의 행에는 없다", async () => {
  const rows = [...(await card("EDITOR")).container.querySelectorAll("li")];
  expect(rows).toHaveLength(2);
  expect(rows[0]!.textContent).toContain(en.projects.importFailure.ownerRetries);
  expect(rows[1]!.textContent).not.toContain(en.projects.importFailure.ownerRetries);
});

it("OWNER에게는 어느 행에도 Owner 안내가 없다", async () => {
  expect((await card("OWNER")).container.textContent).not.toContain(en.projects.importFailure.ownerRetries);
});

it("OWNER·EDITOR 모두 안 읽음 점도 sr `Unread`도 없다 — Home 항목에는 unread가 없다", async () => {
  for (const role of ["OWNER", "EDITOR"] as const) {
    const { container } = await card(role);
    expect(container.querySelector("[data-unread-dot]"), role).toBeNull();
    expect(container.textContent, role).not.toContain(en.inbox.unread);
  }
});

it("행은 링크 + chevron이고 시각은 긴 형이다", async () => {
  const { container } = await card("OWNER");
  const link = container.querySelector("li a")!;
  expect(link.querySelector("svg.lucide-chevron-right")).not.toBeNull();
  expect(link.querySelector(".shrink-0.text-xs")!.textContent).toBe(relativeTime(failed.at, now, "en"));
});
