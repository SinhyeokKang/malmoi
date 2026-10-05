// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import { EventGlyph } from "@/components/logs/glyph";
import { RepositoryCard } from "@/components/settings/repository-card";
import { SourceDetailModal } from "@/components/sources/source-detail-modal";
import { eventGlyph } from "@/lib/events/view";
import type { ConnectionHealth } from "@/lib/github-connect/health";
import { en } from "@/messages/en";
import type { SourceDetail } from "@/lib/sources/query";

import { render } from "./helpers/dom";

vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ connectRepository: vi.fn(), updateRepositorySettings: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ listRepoBranches: vi.fn(), listProjectBranches: vi.fn().mockResolvedValue({ ok: true, names: ["main"], defaultBranch: "main", truncated: false }) }));
vi.mock("@/app/(edit)/projects/[slug]/sources/actions", () => ({ loadSourceDetail: vi.fn(), updateBaseLocale: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }) }));

const classes = (node: Element | null | undefined) => (node?.getAttribute("class") ?? "").split(/\s+/);
const lined = (node: Element | null | undefined, side: "t" | "b") => classes(node).includes(`border-${side}`);
const card = (root: ParentNode, title: string) => [...root.querySelectorAll("section")].find((s) => s.querySelector("h2")?.textContent === title)!;

/**
 * **머리 아래 선은 카드가 하나 긋는다 — notice가 있으면 notice 아래** (DESIGN §6.4 Card · ux-drift-unify T14 · 4-Y1 · U3 r1).
 * 선의 위치·개수는 클래스로 결정되므로 jsdom에서 센다: 머리 영역(머리 + notice 래퍼) 선 하나 + 본문 첫 줄의 `border-t` 0.
 */
function headLines(section: Element) {
  const direct = [...section.children];
  const head = direct.filter((node) => node.tagName === "HEADER" || node.hasAttribute("data-card-notice"));
  const owner = head.filter((node) => lined(node, "b"));
  const firstBody = direct[direct.indexOf(head.at(-1)!) + 1];
  return { owners: owner.length, ownerIsNotice: owner[0]?.hasAttribute("data-card-notice") ?? false, firstBodyTop: lined(firstBody, "t") || lined(firstBody?.firstElementChild, "t") };
}

describe("Repository 카드 — notice 셋 모양 모두 선 하나", () => {
  it.each([
    [{ status: "ok" }, "notice 비어 도착"],
    [{ status: "app-uninstalled" }, "warning Alert"],
    [{ status: "repo-replaced" }, "danger Alert"],
  ] as const)("%o (%s)", async (health, _shape) => {
    const { container } = await render(<RepositoryCard slug="acme" owner="acme" repo="web" branch="main" archived={false} health={Promise.resolve(health as ConnectionHealth)} account={Promise.resolve({ status: "ok", login: "octo" })} appSlug="malmoi" />);
    await act(async () => { await Promise.resolve(); });
    const lines = headLines(card(container, en.settings.repository.title));
    expect(lines).toEqual({ owners: 1, ownerIsNotice: true, firstBodyTop: false });
  });
});

describe("Sources 상세 Status 카드 — 결과 줄 유무", () => {
  const detail = {
    id: "s", slug: "web", baseLocale: "en", declaredBaseLocale: null, lastCommitSha: "abc1234", lastCommitAt: new Date("2026-09-20T00:00:00Z"),
    lastImportStartedAt: null, lastImportError: null, lastImportFailedAt: null, lastImportedAt: new Date("2026-09-20T00:05:00Z"),
    createdAt: new Date("2026-09-19T00:00:00Z"), keys: 3, locales: 1, orphanedLocales: 0, progress: { total: 3, done: 3, review: 0, percent: 100 },
    installed: true, languages: [{ code: "en", isBase: true, orphaned: false, total: 3, translated: 3, needsReview: 0, untranslated: 0, percent: 100 }],
  } as unknown as SourceDetail;
  const draw = (importResult?: { text: string; tone: "success" }) => render(
    <SourceDetailModal slug="p" sourceSlug="web" role="OWNER" state={{ status: "ready", detail }} now={new Date("2026-09-21T00:00:00Z")} busy={false} sources={[{ id: "s", slug: "web" }]} onRemoved={() => {}} onLost={() => {}}
      importResult={importResult} onBusy={() => {}} onClose={() => {}} onReload={() => {}} onImport={() => {}} onSaved={() => {}}
      returnFocusRef={{ current: null }} fallbackFocusRef={{ current: null }} />,
  );
  /** 카드 안의 가로선 전부 — 머리 선 + 줄 사이 선. */
  const rules = (section: Element) => [section, ...section.querySelectorAll("*")].filter((node) => node !== section && (lined(node, "t") || lined(node, "b")));

  it("결과 줄이 없으면 선은 머리 하나다", async () => {
    await draw();
    const status = card(document, en.sources.status);
    expect(rules(status)).toHaveLength(1);
    expect(lined(status.querySelector("header"), "b")).toBe(true);
  });

  /** 결과 줄은 카드 `notice`다(🔴 J — `Alert inset`) — 머리 아래 선이 notice 아래로 내려가 선은 여전히 하나다(4-Y1). */
  it("결과 줄이 있으면 선은 notice 아래 하나다 — 머리도 첫 줄도 선을 들지 않는다", async () => {
    await draw({ text: "Synced 3 keys.", tone: "success" });
    const status = card(document, en.sources.status);
    expect(rules(status)).toHaveLength(1);
    expect(lined(status.querySelector("header"), "b")).toBe(false);
    const notice = status.querySelector("[data-card-notice]");
    expect(notice?.querySelector('[role="status"]')?.getAttribute("data-alert")).toBe("success");
    expect(lined(notice, "b")).toBe(true);
  });
});

/** Settings의 거부 Alert는 머리에 없다 — 본문의 첫 블록이다(2026-10-01 사용자, 옛 자리는 머리 `notice` 슬롯). 본문 안인지는 `page-alert-placement.test.ts`가 잰다. */
it("Settings 머리에 거부 Alert가 없다 — 본문과 함께 스크롤한다", () => {
  const source = readFileSync(join(process.cwd(), "app/(edit)/projects/[slug]/settings/page.tsx"), "utf8");
  const tag = source.match(/<PanelHeader\b([\s\S]*?)>([\s\S]*?)<\/PanelHeader>/);
  expect(tag?.[1]).not.toContain("notice");
  expect(tag?.[2]).not.toContain("<Alert");
});

/**
 * **Logs 글리프 칸 = 결과는 §2.4 상태 칸, 그 밖은 종류 색** (D3③ · U3 r1). 종류·결과 → `eventGlyph`(lib) → `EventGlyph`의 `data-tone`까지
 * 한 번에 잰다. Logs 성공은 회색 칸이다(`logsResultTone`). 설정 종류도 회색 칸이고, 종류 색 셋(번역·소스·멤버)은 상태 칸이 아니라 `data-tone`이 없다.
 */
describe("Logs 글리프 — 종류·결과 → 칸 톤", () => {
  it.each([
    ["IMPORT", "imported", "muted"],
    ["PUBLISH", "sent", "muted"],
    ["IMPORT", "failed", "danger"],
    ["PUBLISH", "partial", "warning"],
    ["IMPORT", "deferred", "warning"],
    ["SETTINGS", null, "muted"],
    ["TRANSLATION", null, null],
    ["SURFACE", null, null],
    ["MEMBER", null, null],
  ] as const)("%s · %s → %s", async (kind, result, tone) => {
    const glyph = eventGlyph({ kind, result, subtype: "x" } as Parameters<typeof eventGlyph>[0]);
    const { container } = await render(<EventGlyph icon={glyph.icon} tone={glyph.tone} />);
    expect(container.firstElementChild?.getAttribute("data-tone")).toBe(tone);
  });
});
