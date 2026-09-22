// @vitest-environment jsdom
import { act } from "react";
import { Dialog } from "radix-ui";
import { describe, expect, it, vi } from "vitest";

import { LogFilters } from "@/components/logs/log-filters";
import { parseLogFilter } from "@/lib/events/filter";
import { EventDetail } from "@/components/logs/event-detail";
import { EventRow } from "@/components/logs/event-row";
import type { EventRow as Row } from "@/lib/events/query";
import { m } from "@/lib/i18n";
import { render } from "./helpers/dom";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const now = new Date("2026-09-20T12:00:00Z");
const row = (over: Partial<Row> = {}): Row => ({
  id: "e1", ref: "evt_test", kind: "IMPORT", subtype: "import.run", occurredAt: now, finishedAt: now,
  result: "imported", actor: { kind: "USER", removed: false, name: "Kim", emailLabel: null },
  surfaceIds: ["s1"], surfaceScope: "sources", run: null,
  payload: { kind: "IMPORT", source: "manual", surfaceSlugs: ["web"], keys: 4, pendingEdits: 0,
    surfaces: [{ surfaceSlug: "web", status: "imported", count: 4, reason: null }], errorCode: null, refusal: null },
  ...over,
});

const detail = (value: Row) => render(
  <Dialog.Root open><Dialog.Content aria-describedby={undefined}>
    <EventDetail row={value} slug="alpha" now={now} archived={false} canOpenSettings={false} repoUrl={null} />
  </Dialog.Content></Dialog.Root>,
);

describe("활동 행과 상세의 실제 동작", () => {
  it("수동 적재 성공은 보호 보류라고 말하지 않고 소스별 결과를 보인다", async () => {
    const { container } = await render(<EventRow row={row()} href="/logs" now={now} archived={false} />);
    expect(container.textContent).toContain("web: Imported");
    expect(container.textContent).not.toContain("Nothing was imported");
  });

  it("남은 편집이 있어도 완료된 적재를 보류로 바꾸지 않는다", async () => {
    const value = row();
    if (value.payload?.kind !== "IMPORT") throw new Error("fixture");
    value.payload.pendingEdits = 2;
    const { container } = await detail(value);
    expect(container.textContent).toContain(m.repositorySync.kept(2));
    expect(container.textContent).not.toContain("Nothing was imported");
  });

  it("실패한 Import는 수집한 오류를 표시한다", async () => {
    const value = row({ result: "failed" });
    if (value.payload?.kind !== "IMPORT") throw new Error("fixture");
    value.payload.errorCode = "parse-failed";
    const { container } = await detail(value);
    expect(container.textContent).toContain(m.projects.importFailure.parseFailed);
  });

  it("상세의 Copy가 참조를 복사한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const { container } = await detail(row());
    const button = [...container.querySelectorAll("button")].find(button => button.textContent === m.logs.detail.actions.copy);
    expect(button).toBeDefined();
    await act(async () => button!.click());
    expect(writeText).toHaveBeenCalledWith("evt_test");
    expect(container.textContent).toContain(m.common.copied);
  });

  it("Home과 상세에도 Publish의 dropped 경고가 보인다", async () => {
    const value = row({ kind: "PUBLISH", subtype: "publish.run", result: "sent", payload: { kind: "PUBLISH", surfaceSlugs: ["web"], refusal: null },
      run: { changed: 1, warnings: 2, prUrl: null, errorCode: null } });
    const { container } = await render(<EventRow row={value} href="/logs" now={now} archived={false} showTime={false} />);
    expect(container.textContent).toContain(m.logs.warnings(2));
    expect((await detail(value)).container.textContent).toContain(m.logs.warnings(2));
  });
});

it("검색 URL이 바뀌면 입력값도 따라간다", async () => {
  const props = { slug: "alpha", sources: [], actors: [], refreshable: true };
  const { container, rerender } = await render(<LogFilters {...props} filter={parseLogFilter({ q: "old" })} />);
  await rerender(<LogFilters {...props} filter={parseLogFilter({})} />);
  expect(container.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe("");
});

it("보관된 Publish의 행과 상세 모두 야간 재시도를 약속하지 않는다", async () => {
  const code = Object.entries(m.logs.reasons).find(([, value]) => value.includes("nightly"))?.[0];
  expect(code).toBeDefined();
  const value = row({ kind: "PUBLISH", subtype: "publish.run", result: "failed",
    run: { changed: null, warnings: 0, prUrl: null, errorCode: code! },
    payload: { kind: "PUBLISH", surfaceSlugs: [], refusal: null } });
  const { container, rerender } = await render(<EventRow row={value} href="/logs" now={now} archived={false} />);
  expect(container.textContent).toContain("nightly");
  await rerender(<EventRow row={value} href="/logs" now={now} archived />);
  expect(container.textContent).not.toContain("nightly");
  const dialog = await render(<Dialog.Root open><Dialog.Content aria-describedby={undefined}>
    <EventDetail row={value} slug="alpha" now={now} archived canOpenSettings={false} repoUrl={null} />
  </Dialog.Content></Dialog.Root>);
  expect(dialog.container.textContent).not.toContain("nightly");
});

/**
 * 상세 껍데기가 **시안이 아니라 1024 모달을 따른다** (2026-09-22 사용자 — `/design-sync`에서
 * 핸드오프 `1d`의 640 판정을 뒤집었다. 근거는 DESIGN §6.68).
 *
 * ⚠️ **여기서 세는 것은 전부 실측이 잡은 것**이다 — 화면에도 값 테스트에도 안 나타난 부류라
 * 구조로 고정하지 않으면 다음 리팩터가 같은 자리를 지운다.
 */
describe("상세 껍데기 — 실측이 잡은 자리", () => {
  /**
   * ⚠️ **목적지 링크가 없는 종류가 있다** — SURFACE·SETTINGS(EDITOR)·번역(대상 소실)이 그렇고,
   * 그때 푸터가 **버튼 0개로 선다**: 구분선과 56px 공백만 남는 판이 실측에서 나왔다.
   * [Close]는 종류와 무관하므로 그 자리를 채우는 것이 맞고, 핸드오프의 세 상세도 전부 들고 있다.
   */
  it("목적지 링크가 없어도 푸터에 [Close]가 선다 — 빈 푸터가 생기지 않는다", async () => {
    const value = row({
      kind: "SURFACE", subtype: "surface.baseLocaleChanged", result: null, finishedAt: null,
      payload: { kind: "SURFACE", surfaceSlug: "web", adapter: null, baseLocale: { before: "ko", after: "en" } },
    });
    const { container } = await detail(value);
    const footer = container.querySelector("[data-event-detail-footer]");
    expect(footer).not.toBeNull();
    expect(footer!.textContent).toContain(m.logs.detail.actions.close);
  });
});
