// @vitest-environment jsdom
import { Dialog } from "radix-ui";
import { expect, it, vi } from "vitest";

import { AttentionCard } from "@/components/home/attention-card";
import { EventDetail } from "@/components/logs/event-detail";
import { EventRow } from "@/components/logs/event-row";
import { GrantBadges } from "@/components/mcp/grant-badges";
import { RoleChip } from "@/components/members/role-chip";
import { ProfileNameForm } from "@/components/account/profile-name-form";
import { CiCard } from "@/components/settings/ci-card";
import { SourcesArchived } from "@/components/sources/sources-archived";
import { SyncLockBanner } from "@/components/translations/sync-lock";
import { groupByDay } from "@/lib/events/view";
import type { EventRow as Row } from "@/lib/events/query";
import { languageName } from "@/lib/onboarding/language-name";
import { relativeTime } from "@/lib/relative-time";
import { utcDay, utcMinute } from "@/lib/utc-time";
import { ko } from "@/messages/ko";
import { render } from "./helpers/dom";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));

/**
 * **화면 언어가 실제로 ko로 그려지는지** — 화면군마다 대표 컴포넌트 하나를 ko로 렌더해 사전 값과 날짜 형식(`2026년 9월 20일`)을 단언한다.
 * 클라이언트 컴포넌트는 provider(`{ uiLocale: "ko" }`), 서버가 `m`·`uiLocale`을 넘기는 공용 컴포넌트는 prop으로 ko를 준다.
 * 날짜·상대 시각이 없는 컴포넌트(Members·Settings·Account·MCP)는 라벨만 잰다.
 */
const now = new Date("2026-09-20T12:00:00Z");
const at = new Date("2026-09-18T09:30:00Z");

it("Home — 주의 카드의 제목과 상대 시각이 ko다", async () => {
  const item = { kind: "review" as const, at, surfaceSlug: "web", code: "ja", name: "Japanese", count: 8, who: "Kim" };
  const { container } = await render(<AttentionCard items={{ shown: [item], more: [], count: 1 }} slug="a" role="OWNER" state="default" now={now} uiLocale="ko" m={ko} />);
  expect(container.textContent).toContain(ko.home.attention.title);
  expect(container.textContent).toContain(relativeTime(at, now, "ko"));
  expect(relativeTime(at, now, "ko")).not.toBe(relativeTime(at, now, "en"));
});

it("Sources — 보관 화면의 날짜가 ko 형식이다", async () => {
  const { container } = await render(<SourcesArchived slug="a" role="OWNER" archivedAt={at} uiLocale="ko" m={ko} />);
  expect(container.textContent).toContain(utcDay(at, "ko"));
  expect(utcDay(at, "ko")).toBe("2026년 9월 18일");
});

it("Translations — 동기화 잠금 배너의 문장과 시각이 ko다", async () => {
  const { container } = await render(<SyncLockBanner reopensBy={at} />, { uiLocale: "ko" });
  expect(container.textContent).toContain(utcMinute(at, "ko"));
  expect(container.textContent).toContain(ko.translations.workspace.syncLock.title);
});

it("Members — 역할 칩이 ko 낱말이다", async () => {
  const { container } = await render(<RoleChip role="OWNER" reason="pending" />, { uiLocale: "ko" });
  expect(container.textContent).toContain(ko.projects.role.OWNER);
});

it("Logs — 날짜 머리·언어 이름·상세 시각이 ko다", async () => {
  const groups = groupByDay(ko, "ko", [{ occurredAt: at }], now);
  expect(groups[0]?.heading).toBe("2026년 9월 18일");
  const row: Row = {
    id: "e1", ref: "evt_ko", kind: "TRANSLATION", subtype: "translation.saved", occurredAt: at, finishedAt: at, result: null,
    actor: { kind: "USER", removed: false, name: "Kim", emailLabel: null }, surfaceIds: ["s1"], surfaceScope: "sources", run: null,
    payload: { kind: "TRANSLATION", key: "home.title", locale: "fr", before: "a", after: "b", surfaceSlug: "web" } as Row["payload"],
  };
  const list = await render(<EventRow row={row} href="/logs" now={now} archived={false} uiLocale="ko" m={ko} />);
  expect(list.container.textContent).toContain(languageName("fr", "ko"));
  expect(languageName("fr", "ko")).not.toBe(languageName("fr", "en"));
  const detail = await render(
    <Dialog.Root open><Dialog.Content aria-describedby={undefined}>
      <EventDetail row={row} slug="a" now={now} archived={false} canOpenSettings={false} repoUrl={null} uiLocale="ko" m={ko} />
    </Dialog.Content></Dialog.Root>,
  );
  expect(detail.container.textContent).toContain(utcMinute(at, "ko"));
});

it("Settings — CI 카드의 안내가 ko다", async () => {
  const { container } = await render(<CiCard slug="a" archived={false} stale={[]}>{false}</CiCard>, { uiLocale: "ko" });
  expect(container.textContent).toContain(ko.settings.ci.noSources);
});

it("Account — 프로필 폼의 저장 버튼이 ko다", async () => {
  const { container } = await render(<ProfileNameForm name="Kim" inputId="n" />, { uiLocale: "ko" });
  expect(container.textContent).toContain(ko.account.profile.save);
});

it("MCP — 권한 배지가 ko다", async () => {
  const { container } = await render(<GrantBadges grants={[]} />, { uiLocale: "ko" });
  expect(container.textContent).toContain(ko.mcpConnector.token.readOnly);
});
