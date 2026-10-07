// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { CountCards } from "@/components/home/count-cards";
import { MetaColumn } from "@/components/home/meta-column";
import { TranslationsView } from "@/components/landing/mockup/translations";
import { TreePanel } from "@/components/translations/workspace/tree-panel";
import { LocalePanel } from "@/components/translations/workspace/locale-panel";
import { CountBadge } from "@/components/ui/count-badge";
import { Card } from "@/components/ui/card";
import { SegmentBody } from "@/components/ui/segmented-control";
import { countCards } from "@/lib/home/cards";
import { metaTabs } from "@/lib/home/meta";
import { en } from "@/messages/en";
import { ko } from "@/messages/ko";
import { es } from "@/messages/es";

import { props } from "./helpers/workspace-props";
import { render } from "./helpers/dom";

const now = new Date("2026-10-08T00:00:00Z");
const cases = [["en", en, "10,000"], ["ko", ko, "10,000"], ["es", es, "10.000"]] as const;

describe.each(cases)("화면 수량 %s", (uiLocale, m, expected) => {
  it("공통 배지·카드·세그먼트의 보이는 수와 낭독 문장이 같은 형식이다", async () => {
    const label = m.translations.keys(10000);
    const { container } = await render(<>
      <CountBadge count={10000} label={label} />
      <Card title={m.sources.title} count={10000} countLabel={label}><p /></Card>
      <SegmentBody label={m.sources.title} count={10000} countLabel={label} />
    </>, { uiLocale });
    const badges = [...container.querySelectorAll(".rounded-full")];
    expect(badges).toHaveLength(3);
    for (const badge of badges) {
      expect(badge.querySelector('[aria-hidden="true"]')?.textContent).toBe(expected);
      expect(badge.querySelector(".sr-only")?.textContent).toBe(label);
      expect(label).toContain(expected);
    }
  });

  it("트리의 전 소스·소스·전체 네임스페이스·네임스페이스 수를 같은 형식으로 표시한다", async () => {
    const tree = { projectKeyCount: 10000, surfaces: [{ ...props().tree.surfaces[0]!, keyCount: 10000, namespaces: [{ name: "common", keyCount: 10000 }] }] };
    const { container } = await render(<TreePanel tree={tree} surfaceSlug="web" ns="common" allSources={{ count: 10000 }} onSelect={() => {}} />, { uiLocale });
    const rows = [...container.querySelectorAll("button")];
    expect(rows).toHaveLength(4);
    for (const row of rows) expect(row.lastElementChild?.textContent).toBe(expected);
  });

  it("Home 카드의 + 접두와 0을 유지하고 메타 수치도 같은 UI locale로 표시한다", async () => {
    const cards = countCards({ state: "default", counts: { newFromGithub: 10000, toTranslate: 10000, toReview: 10000, toSend: 0 }, surfaces: 1, keys: 10000, lastSyncAt: null, reviewByLocale: [], hold: null });
    const cardView = await render(<CountCards cards={cards} slug="acme" surfaceSlugs={{ newFromGithub: "web", toTranslate: "web", toReview: "web", toSend: "web" }} now={now} uiLocale={uiLocale} m={m} />);
    expect([...cardView.container.querySelectorAll(".text-2xl")].map(node => node.textContent)).toEqual([`+${expected}`, expected, expected, "0"]);
    const tabs = metaTabs({ repository: { owner: "o", name: "r", branch: "main", connection: "connected" }, ciConfigured: true, surfaceCount: 10000, keys: 10000, members: 10000, pendingInvites: 10000, createdAt: now, archivedAt: null, lastSync: null, lastPublish: null, held: null, prState: "absent" });
    const meta = await render(<MetaColumn tabs={tabs} slug="acme" now={now} canOpenSettings={false} uiLocale={uiLocale} m={m} />, { uiLocale });
    const values = [...meta.container.querySelectorAll("dd")].map(node => node.textContent);
    expect(values.filter(text => text === expected)).toHaveLength(2);
    expect(values).toContain(`${expected} (${expected})`);
  });

  it("상세의 추가 참조 수를 현지화하고 코드 행 번호는 유지한다", async () => {
    const detail = props().detail!;
    const refs = Array.from({ length: 10001 }, () => ({ path: "src/a.tsx", line: 10000, href: null }));
    const { container } = await render(<LocalePanel detail={{ ...detail, refs }} draft={{ keyId: detail.key.id, order: [], draft: {}, saved: {} }} language={undefined} onLanguage={() => {}} onEdit={() => {}} onReset={() => {}} onSave={() => {}} copyHref="/projects/acme" readOnly footer={null} />, { uiLocale });
    expect(container.textContent).toContain(` +${expected}`);
    expect(container.textContent).toContain("src/a.tsx:10000");
    expect(container.textContent).toContain(m.translations.workspace.detail.referenced(10001));
  });

  it("랜딩 UI 카운터를 현지화하고 영어 고정 키·원본 데이터는 유지한다", async () => {
    const source = m.landing.mockup.sources[0]!;
    const fixture = { ...m.landing.mockup, keyCount: 10000, source: source.slug, sources: [{ ...source, keyCount: 10000, namespaces: [{ name: "common", keyCount: 10000 }] }] };
    const dict = { ...m, landing: { ...m.landing, mockup: fixture } };
    const { container } = await render(<TranslationsView m={dict} phase="missing" uiLocale={uiLocale} />, { uiLocale });
    expect(container.textContent).toContain(m.translations.keys(10000));
    expect([...container.querySelectorAll(".text-xs")].filter(node => node.textContent === expected).length).toBeGreaterThanOrEqual(3);
    expect(container.textContent).toContain(fixture.selected.key);
    expect(m.landing.mockup.selected.key).toBe(en.landing.mockup.selected.key);
  });
});
