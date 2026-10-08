import { ListRow } from "@/components/ui/list-row";
import { Archive, ChevronRight, CircleCheck } from "lucide-react";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

import { canPerform, type Role } from "@/lib/auth/permission";
import type { AttentionItem, AttentionList } from "@/lib/home/attention";
import type { HomeState } from "@/lib/home/state";
import { attentionRowSlots } from "@/components/inbox/row-slots";
import type { UiLocale } from "@/lib/i18n/locales";
import type { Messages } from "@/lib/i18n";

/**
 * `Needs your attention` (캔버스 `2a` 왼쪽 가운데).
 *
 * ⚠️ **`+2 more`가 `<details>`다** (DESIGN §6.64) — 클라이언트 상태가 0이라 Home 전체가 순수 서버
 * 컴포넌트로 남는다. `client-graph.test.ts`가 보는 그래프가 안 늘고 번들도 안 는다.
 *
 * ⚠️ **행에 버튼도 바닥 링크도 없다** — 이 항목은 DB 상태에서 파생된 **사실**이라 지워도 원인이
 * 남고, 전체 목록 화면을 만들면 Home과 같은 것이 둘이 된다 (캔버스 근거 열).
 */

export function AttentionCard({ items, slug, role, state, now, uiLocale, m }: {
  items: AttentionList;
  slug: string;
  /** 가져오기 실패의 재시도가 OWNER 전용이라 EDITOR 행에만 그 사실 한 줄이 붙는다. */
  role: Role;
  state: HomeState;
  now: Date;
  uiLocale: UiLocale;
  m: Messages;
}) {
  return (
    /*
      ⚠️ **`<section>`은 접근 이름이 있을 때만 `region` 랜드마크다** — 없으면 Chrome이 `generic`으로
      접어 이 블록이 접근성 트리에서 통째로 사라진다 (2026-09-15 CDP 실측). 시각적으로는 같아서
      화면에도 jsdom 테스트에도 안 나타나는 부류다 (2026-09-13의 `combobox` 빈 이름과 같은 축).
    */
    /*
      카드 머리는 `Card`가 든다(5-Y12 — 손으로 복제한 머리가 셋이었다). 머리 아래 선도 머리가 긋고, 접근 이름(`region`)도 프리미티브가 건다.
      ⚠️ **빈 상태에는 pill이 없다** (캔버스 `2a-empty`) — `0`을 배지로 세우면 하나의 항목처럼 읽힌다. `CountBadge`가 든다.
    */
    <Card title={m.home.attention.title} count={items.count} countLabel={m.home.attention.count(items.count)}>
      {items.count === 0 ? (
        /*
          카드 안 0건은 `EmptyState placement="inset"`이다. 머리 선은 Card가 하나만 긋는다.
        */
        <EmptyState placement="inset"
            icon={state === "archived" ? Archive : CircleCheck}
            title={state === "archived" ? m.home.attention.archived.title : m.home.attention.empty.title}
            description={state === "archived" ? m.home.attention.archived.description : m.home.attention.empty.description}
          />
      ) : (
        <>
          <ul>
            {items.shown.map((item) => (
              // 첫 행은 머리 선 바로 아래라 자기 선을 내려놓는다.
              <li key={itemKey(item)} className="[&:first-child>a]:border-t-0">
                <AttentionRow item={item} slug={slug} role={role} now={now} uiLocale={uiLocale} m={m} />
              </li>
            ))}
          </ul>
          {items.more.length > 0 && (
            /*
              ⚠️ **브라우저 기본 marker를 지운다** — 두 엔진이 서로 다른 삼각형을 그리고, 그 위에
              chevron을 얹으면 표식이 둘이 된다 (`[&::-webkit-details-marker]`는 Safari·Chrome,
              `list-none`이 Firefox를 덮는다). 회전도 CSS다: JS를 쓰면 이 카드가 클라이언트가 된다.
            */
            <details className="group">
              <summary className="focus-visible:ring-ring hover:bg-foreground/[0.02] border-border flex cursor-pointer list-none items-center gap-1 border-t px-4 py-3.5 text-xs focus-visible:ring-2 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden />
                {m.home.attention.more(items.more.length)}
              </summary>
              <ul>
                {items.more.map((item) => (
                  <li key={itemKey(item)}>
                    <AttentionRow item={item} slug={slug} role={role} now={now} uiLocale={uiLocale} m={m} />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </Card>
  );
}

/**
 * 항목 하나. **행 전체가 링크이고 chevron은 표시일 뿐이다** — 가져오기 실패는 Sources(표면별 사유와
 * 재시도가 사는 자리 — audit #6: 전엔 설정 화면이었고 거기엔 그 정보가 0이었다), 나머지 둘은 그 로케일만
 * 보이는 번역 화면이다.
 *
 * ⚠️ **EDITOR도 같은 링크다** (audit #6 r1 — 사용자 결정) — Sources는 `translation:write`라 EDITOR도 열어 사유를
 * 읽는다. 재시도만 `project:settings` 뒤라 그 사실 한 줄이 붙는다 (`/projects` 목록 띠와 같은 규칙).
 *
 * ⚠️ **선은 `Card` 규칙이다** (4-Y4 · DESIGN §6.64) — 머리↔첫 행은 머리의 `--divider`(#f0f0f0), 행↔행은 `--border`(#e5e5e5).
 * 옛 판은 행↔행도 `--divider`라 같은 `EventRow`가 Home과 Logs에서 반대 색이었다.
 */
function AttentionRow({ item, slug, role, now, uiLocale, m }: { item: AttentionItem; slug: string; role: Role; now: Date;
  uiLocale: UiLocale;
  m: Messages;
}) {
  // ⚠️ 권한 판정은 이 호출부의 몫이다 — 공유 슬롯은 `ownerRetries`만 받고 다시 판정하지 않는다(inbox-page D3). Home 항목에는 `unread`가 없어 점도 안 선다.
  const ownerRetries = item.kind === "import_failed" && !canPerform(role, "project:settings");
  const { href, ...slots } = attentionRowSlots(m, uiLocale, slug, { ...item, ownerRetries }, now, { time: "long" });

  return <ListRow chevron href={href} className="border-border border-t text-base" {...slots} />;
}

/** 표면·로케일이 키다 — 같은 표면에 같은 코드가 둘일 수 없다(`@@id([projectId, surfaceId, code])`). */
function itemKey(item: AttentionItem): string {
  return item.kind === "import_failed" ? `failed:${item.surfaceSlug}` : `${item.kind}:${item.surfaceSlug}:${item.code}`;
}
