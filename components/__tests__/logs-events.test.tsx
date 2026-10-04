// @vitest-environment jsdom
import { act } from "react";
import { Dialog } from "radix-ui";
import { describe, expect, it, vi } from "vitest";

import { LogFilters } from "@/components/logs/log-filters";
import { parseLogFilter } from "@/lib/events/filter";
import { EventDetail } from "@/components/logs/event-detail";
import { EventRow } from "@/components/logs/event-row";
import type { EventRow as Row } from "@/lib/events/query";
import { en } from "@/messages/en";
import { render } from "./helpers/dom";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const now = new Date("2026-09-20T12:00:00Z");
const row = (over: Partial<Row> = {}): Row => ({
  id: "e1", ref: "evt_test", kind: "IMPORT", subtype: "import.run", occurredAt: now, finishedAt: now,
  result: "imported", actor: { kind: "USER", removed: false, name: "Kim", emailLabel: null },
  surfaceIds: ["s1"], surfaceScope: "sources", run: null,
  payload: { kind: "IMPORT", source: "manual", surfaceSlugs: ["web"], keys: 4, pendingEdits: 0,
    surfaces: [{ surfaceSlug: "web", status: "imported", count: 4, reason: null }], errorCode: null, refusal: null, deferReason: null, changedValues: null },
  ...over,
});

const detail = (value: Row) => render(
  <Dialog.Root open><Dialog.Content aria-describedby={undefined}>
    <EventDetail row={value} slug="alpha" now={now} archived={false} canOpenSettings={false} repoUrl={null} uiLocale="en" m={en} />
  </Dialog.Content></Dialog.Root>,
);

describe("활동 행과 상세의 실제 동작", () => {
  /** B1 r3 — no-changes 실행이 닫은 PR은 SKIPPED 행의 prUrl이다. 상세가 "닫았다"로 말하고, 보낸 PR로 읽히지 않는다. */
  it.each([["https://github.com/o/r/pull/4", true], [null, false]] as const)("스킵 실행의 prUrl(%s)은 닫은 PR로 선다", async (url, shown) => {
    const { container } = await detail(row({ kind: "PUBLISH", subtype: "publish.run", result: "nothingToSend",
      payload: { kind: "PUBLISH", surfaceSlugs: ["web"], refusal: null }, run: { changed: 0, changedValues: 0, warnings: 0, withheld: 0, prUrl: url, errorCode: null } }));
    expect(container.textContent?.includes(en.logs.detail.labels.closedPullRequest)).toBe(shown);
    expect(container.textContent?.includes(en.logs.detail.closedPullRequest)).toBe(shown);
  });

  /** delivery-invariants D7 — Logs 상세가 모달과 같은 수를 한 줄로 말한다. 짝: 보류 0이면 줄이 없다. */
  it.each([[2, true], [0, false]] as const)("Publish 상세는 보류 %i건을 한 줄로 말한다(%s)", async (n, shown) => {
    const { container } = await detail(row({ kind: "PUBLISH", subtype: "publish.run", result: n > 0 ? "notSent" : "nothingToSend",
      payload: { kind: "PUBLISH", surfaceSlugs: ["web"], refusal: null }, run: { changed: 0, changedValues: 0, warnings: 0, withheld: n, prUrl: null, errorCode: null } }));
    expect(container.textContent?.includes(en.logs.detail.withheld(2))).toBe(shown);
  });

  it("수동 적재 성공은 보호 보류라고 말하지 않고 소스별 결과를 보인다", async () => {
    const { container } = await render(<EventRow row={row()} href="/logs" now={now} archived={false} uiLocale="en" m={en} />);
    // 보조줄은 `[Manual sync] [web]  4 keys` — 소스는 언제나 배지이고 결과 낱말을 인라인에 싣지 않는다(ux-drift-unify 4-Y20).
    const badges = [...container.querySelectorAll("[data-event-meta] .rounded-full")].map((node) => node.textContent);
    expect(badges).toEqual(["Manual sync", "web"]);
    expect(container.querySelector("[data-event-meta]")?.textContent).toContain("4 keys");
    expect(container.textContent).not.toContain("Nothing was imported");
  });

  it("남은 편집이 있어도 완료된 적재를 보류로 바꾸지 않는다", async () => {
    const value = row();
    if (value.payload?.kind !== "IMPORT") throw new Error("fixture");
    value.payload.pendingEdits = 2;
    const { container } = await detail(value);
    expect(container.textContent).toContain(en.repositorySync.kept(2));
    expect(container.textContent).not.toContain("Nothing was imported");
  });

  it("실패한 Import는 수집한 오류를 표시한다", async () => {
    const value = row({ result: "failed" });
    if (value.payload?.kind !== "IMPORT") throw new Error("fixture");
    value.payload.errorCode = "parse-failed";
    const { container } = await detail(value);
    expect(container.textContent).toContain(en.projects.importFailure.parseFailed);
  });

  /**
   * ⚠️ **상세는 지난 기록이다 — live 영역을 두지 않는다** (B6 r1, 2026-09-24 사용자). 실패 노트를 `Alert danger`로
   * 올렸더니 `role="alert"`가 따라와 상세를 여는 순간 assertive로 끼어들었다(DESIGN §6.644의 판정과 반대).
   * 실패는 **아이콘만 붉다.** 짝: 같은 상세가 실패 문장을 실제로 보인다.
   */
  it.each([
    ["실패", row({ result: "failed" })],
    ["진행 중", row({ result: "running" })],
  ] as const)("%s 상세에 live 영역이 없다", async (_, value) => {
    const { container } = await detail(value);
    expect(container.querySelectorAll('[role="alert"], [role="status"], [aria-live]')).toHaveLength(0);
  });

  it("실패 노트는 아이콘만 붉고 문장은 본문 색이다", async () => {
    const { container } = await detail(row({ result: "failed" }));
    const note = [...container.querySelectorAll("[data-event-note]")];
    expect(note).toHaveLength(1);
    expect(note[0]!.querySelector("svg")?.getAttribute("class")).toContain("text-destructive");
    expect(note[0]!.className).not.toContain("text-destructive");
    expect(note[0]!.textContent?.length).toBeGreaterThan(0);
  });

  it("상세의 Copy가 참조를 복사한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const { container } = await detail(row());
    const button = [...container.querySelectorAll("button")].find(button => button.textContent === en.logs.detail.actions.copy);
    expect(button).toBeDefined();
    await act(async () => button!.click());
    expect(writeText).toHaveBeenCalledWith("evt_test");
    expect(container.textContent).toContain(en.common.copied);
  });

  it("Home과 상세에도 Publish의 dropped 경고가 보인다", async () => {
    const value = row({ kind: "PUBLISH", subtype: "publish.run", result: "sent", payload: { kind: "PUBLISH", surfaceSlugs: ["web"], refusal: null },
      run: { changed: 1, changedValues: 1, warnings: 2, withheld: 0, prUrl: null, errorCode: null } });
    const { container } = await render(<EventRow row={value} href="/logs" now={now} archived={false} showTime={false} uiLocale="en" m={en} />);
    expect(container.textContent).toContain(en.logs.warnings(2));
    expect((await detail(value)).container.textContent).toContain(en.logs.warnings(2));
  });
});

/**
 * ⚠️ **검색은 필터 줄 끝이다** (2026-09-24 사용자) — 번역 화면의 툴바와 같은 형이다: 제목 줄은
 * 제목과 행동([Refresh])뿐이고, 좁히는 도구(필터 · 검색)는 한 줄에 모인다. 공용 `SearchInput`을
 * 지나야 IME 조합 확정 Enter가 검색으로 나가지 않는다.
 */
it("검색 필드가 필터와 같은 줄의 끝에 선다 — 제목 줄에 없다", async () => {
  const props = { slug: "alpha", sources: [], actors: [], refreshable: true };
  const { container } = await render(<LogFilters {...props} filter={parseLogFilter({})} />);
  const search = container.querySelector('input[type="search"]');
  const row = search?.closest("[data-log-filter-row]");
  expect(row).not.toBeNull();
  expect(row!.lastElementChild!.contains(search!)).toBe(true);
  expect(row!.querySelector('button[aria-label^="Kind"]')).not.toBeNull();
  expect(container.querySelector("h1")?.parentElement?.contains(search!)).toBe(false);
});

it("검색 URL이 바뀌면 입력값도 따라간다", async () => {
  const props = { slug: "alpha", sources: [], actors: [], refreshable: true };
  const { container, rerender } = await render(<LogFilters {...props} filter={parseLogFilter({ q: "old" })} />);
  await rerender(<LogFilters {...props} filter={parseLogFilter({})} />);
  expect(container.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe("");
});

it("보관된 Publish의 행과 상세 모두 야간 재시도를 약속하지 않는다", async () => {
  const code = Object.entries(en.logs.reasons).find(([, value]) => value.includes("nightly"))?.[0];
  expect(code).toBeDefined();
  const value = row({ kind: "PUBLISH", subtype: "publish.run", result: "failed",
    run: { changed: null, changedValues: null, warnings: 0, withheld: 0, prUrl: null, errorCode: code! },
    payload: { kind: "PUBLISH", surfaceSlugs: [], refusal: null } });
  const { container, rerender } = await render(<EventRow row={value} href="/logs" now={now} archived={false} uiLocale="en" m={en} />);
  expect(container.textContent).toContain("nightly");
  await rerender(<EventRow row={value} href="/logs" now={now} archived uiLocale="en" m={en} />);
  expect(container.textContent).not.toContain("nightly");
  const dialog = await render(<Dialog.Root open><Dialog.Content aria-describedby={undefined}>
    <EventDetail row={value} slug="alpha" now={now} archived canOpenSettings={false} repoUrl={null} uiLocale="en" m={en} />
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
    expect(footer!.textContent).toContain(en.logs.detail.actions.close);
  });

  /**
   * 상세의 칩은 목록 행(28)보다 크고, 본문은 칩이 아니라 **제목 열**에 맞춰 들어간다 —
   * 좌측 24 + 칩 40 + 간격 12 = 76. 셋 중 하나만 바뀌면 필드가 제목과 어긋난다.
   */
  it("칩은 40이고 본문은 제목 열(76px)에서 시작한다", async () => {
    const { container } = await detail(row());
    const glyph = container.querySelector("[data-event-detail-header] > [aria-hidden]");
    expect(glyph?.className).toContain("size-10");
    expect(container.querySelector("[data-event-detail-header]")?.className).toMatch(/\bpx-6\b.*\bgap-3\b|\bgap-3\b.*\bpx-6\b/);
    expect(container.querySelector("[data-event-detail-body]")?.className).toContain("pl-[76px]");
  });

  it("필드는 표이고 라벨이 행 헤더다 — 값마다 라벨이 읽힌다", async () => {
    const { container } = await detail(row());
    const head = [...container.querySelectorAll("[data-event-detail-body] table th")];
    expect(head.map(th => th.getAttribute("scope"))).toEqual(head.map(() => "row"));
    expect(head[0]?.textContent).toBe(en.logs.detail.labels.reference);
  });

  /**
   * 행 높이의 기준은 [Copy reference]가 든 행이다 — 버튼 28 + 위아래 10×2 = 48. 기준이 없으면
   * 참조 행만 6px 더 높아 표의 리듬이 첫 줄에서 깨진다.
   */
  it("모든 행이 참조 행 높이(48)를 최소로 갖는다", async () => {
    const { container } = await detail(row());
    const rows = [...container.querySelectorAll("[data-event-detail-body] table tr")];
    expect(rows.length).toBeGreaterThan(1);
    for (const tr of rows) expect(tr.className).toMatch(/\bh-12\b/);
  });
});

/** ux-drift-unify T21 — 상세 머리가 행과 같은 문법이다. */
describe("상세 머리·바닥 — 행과 한 문법 (4-Y21 · 3-Y6)", () => {
  it("머리는 `[종류 배지][결과 배지]`이고 종류 낱말은 행 보조줄의 첫 배지와 같다", async () => {
    const value = row();
    const { container: rowView } = await render(<EventRow row={value} href="/logs" now={now} archived={false} uiLocale="en" m={en} />);
    const kind = rowView.querySelector("[data-event-meta] .rounded-full")?.textContent;
    const { container } = await detail(value);
    const badges = [...container.querySelectorAll("[data-event-detail-kind] .rounded-full")].map((node) => node.textContent);
    expect(badges).toEqual([kind, en.logs.status.imported]);
    // 옛 muted 글자 `Sync run`은 걷혔다 — 같은 종류가 두 낱말이었다.
    expect(container.querySelector("[data-event-detail-kind]")?.className).not.toContain("text-muted-foreground");
  });

  it("바닥 버튼은 1024 표면의 `lg`다 — [Close]와 목적지가 같은 크기다", async () => {
    const { container } = await render(
      <Dialog.Root open><Dialog.Content aria-describedby={undefined}>
        <EventDetail row={row({ kind: "MEMBER", subtype: "member.joined", result: null, finishedAt: null, payload: { kind: "MEMBER", targetLabel: "a@b", role: null } })} slug="alpha" now={now} archived={false} canOpenSettings repoUrl={null} uiLocale="en" m={en} />
      </Dialog.Content></Dialog.Root>,
    );
    const actions = [...container.querySelectorAll("[data-event-detail-footer] a, [data-event-detail-footer] button")];
    expect(actions).toHaveLength(2);
    for (const node of actions) expect(node.className.split(" ")).toContain("h-10");
  });

  /** U4 리뷰 — 지문 재확인으로 멈춘 Publish는 "held back its edits"가 아니다(아무것도 안 보냈고 보류가 아니다). */
  it("reconfirm으로 멈춘 Publish는 자기 문장을 든다 · 보류로 인한 notSent는 그대로 (짝)", async () => {
    const publish = (errorCode: string | null) => row({ kind: "PUBLISH", subtype: "publish.run", result: "notSent",
      payload: { kind: "PUBLISH", surfaceSlugs: ["web"], refusal: null }, run: { changed: 0, changedValues: errorCode === null ? 0 : null, warnings: 0, withheld: errorCode === null ? 2 : 0, prUrl: null, errorCode } });
    const { container: stopped } = await render(<EventRow row={publish("reconfirm")} href="/logs" now={now} archived={false} uiLocale="en" m={en} />);
    expect(stopped.textContent).not.toContain("held back its edits");
    expect(stopped.textContent).toContain("stopped before sending");
    const { container: held } = await render(<EventRow row={publish(null)} href="/logs" now={now} archived={false} uiLocale="en" m={en} />);
    expect(held.textContent).toContain("held back its edits");
  });
});

/**
 * **소스별 결과도 Logs의 결과 톤이다** (malmoi#163 · D3③ — Logs의 성공은 무색). 머리의 Synced는 neutral인데 같은 모달의 소스별 Synced가
 * 별도 표(`SURFACE_VARIANT`)로 초록이었다 — 같은 낱말이 한 모달에서 두 톤이었다. 부분은 warning, 실패는 danger 알약(`soft-red`, design §3.6)이다.
 */
describe("상세 — Result per source", () => {
  it("머리와 소스별 결과가 같은 낱말이면 같은 톤이다", async () => {
    const value = row();
    if (value.payload?.kind !== "IMPORT") throw new Error("fixture");
    value.payload.surfaces = [
      { surfaceSlug: "web", status: "imported", count: 4, reason: null },
      { surfaceSlug: "app", status: "partial", count: 2, reason: null },
      { surfaceSlug: "docs", status: "failed", count: null, reason: null },
      { surfaceSlug: "old", status: "superseded", count: null, reason: null },
    ];
    const { container } = await detail(value);
    const head = [...container.querySelectorAll("[data-event-detail-kind] .rounded-full")].find((b) => b.textContent === en.logs.status.imported)!;
    const perSource = (word: string) => [...container.querySelectorAll(".rounded-full")].filter((b) => b.textContent === word && !b.closest("[data-event-detail-kind]"));
    const synced = perSource(en.logs.status.imported);
    expect(synced).toHaveLength(1);
    expect(synced[0]!.className).toBe(head.className);
    expect(synced[0]!.className).not.toMatch(/green/);
    expect(perSource(en.logs.status.partial)[0]!.className).toMatch(/amber/);
    expect(perSource(en.logs.status.failed)[0]!.className).toContain("text-destructive");
    expect(perSource(en.logs.status.superseded)[0]!.className).toContain("bg-foreground/5");
  });
});

/** 같은 결과가 목록·최근 로그·상세 머리에서 같은 낱말과 면이다. */
it.each([
  ["IMPORT", "running", "Syncing…", "bg-foreground/5"],
  ["PUBLISH", "running", "Publishing…", "bg-foreground/5"],
  ["PUBLISH", "sent", "Sent", "bg-foreground/5"],
  ["PUBLISH", "nothingToSend", "Nothing to send", "bg-foreground/5"],
  ["PUBLISH", "notSent", "Held back", "bg-amber-100/80"],
  ["IMPORT", "imported", "Synced", "bg-foreground/5"],
  ["IMPORT", "deferred", "Held", "bg-amber-100/80"],
  ["IMPORT", "partial", "Partially synced", "bg-amber-100/80"],
  ["IMPORT", "superseded", "Superseded", "bg-foreground/5"],
  ["IMPORT", "notStarted", "Not started", "bg-amber-100/80"],
  ["IMPORT", "failed", "Failed", "bg-destructive/8"],
  ["IMPORT", "upToDate", "Up to date", "bg-foreground/5"],
] as const)("%s %s 결과 슬롯은 %s다", async (kind, result, label, face) => {
  const value = row({ kind, result, ...(kind === "PUBLISH" ? { payload: { kind: "PUBLISH", surfaceSlugs: ["web"], refusal: null } as const } : {}) });
  for (const showTime of [true, false]) {
    const { container } = await render(<EventRow row={value} href="/logs?event=evt_test" now={now} archived={false} showTime={showTime} uiLocale="en" m={en} />);
    const pills = [...container.querySelectorAll(".rounded-full")].filter(node => node.textContent === label);
    expect(pills).toHaveLength(1);
    expect(pills[0]!.classList.contains(face)).toBe(true);
    expect(pills[0]!.closest("[data-event-meta]")).toBeNull();
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/logs?event=evt_test");
  }
  const { container } = await detail(value);
  const pills = [...container.querySelectorAll("[data-event-detail-header] .rounded-full")].filter(node => node.textContent === label);
  expect(pills).toHaveLength(1);
  expect(pills[0]!.classList.contains(face)).toBe(true);
});

it.each([
  [row({ result: "running" }), en.logs.detail.noResult, null],
  [row({ kind: "SETTINGS", result: null, subtype: "settings.pushTokenRotated", payload: null }), en.logs.meta.tokenEffect, en.logs.detail.notes.token],
] as const)("정보 Note는 기존 문구와 비live 슬롯을 유지한다", async (value, body, note) => {
  const { container } = await detail(value);
  const wrapper = container.querySelector("[data-event-note]")!;
  const paragraphs = [...wrapper.querySelectorAll("p")].map(node => node.textContent);
  expect(paragraphs).toEqual(note === null ? [body] : [body, note]);
  expect(wrapper.querySelector('[role="alert"], [role="status"], [aria-live]')).toBeNull();
  expect(wrapper.querySelector("svg")?.getAttribute("class")).toContain("text-muted-foreground");
});

it("Logs keeps320px search inside the outer ml-auto filter flex item", async () => {
  const { container } = await render(<LogFilters slug="alpha" sources={[]} actors={[]} refreshable filter={parseLogFilter({})} />);
  const field = container.querySelector<HTMLElement>('input[type="search"]')!;
  expect(field.classList.contains("w-80")).toBe(true);
  expect(field.classList.contains("ml-auto")).toBe(false);
  const outer = field.closest("[data-log-filter-row]")?.lastElementChild;
  expect(outer?.contains(field)).toBe(true);
  expect(outer?.classList.contains("ml-auto")).toBe(true);
  expect(outer?.parentElement).toBe(field.closest("[data-log-filter-row]"));
});
