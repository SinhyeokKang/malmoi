import { CircleCheck } from "lucide-react";

import { attentionItemKey, attentionRowSlots } from "@/components/inbox/row-slots";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { ProjectThumbnail } from "@/components/ui/project-thumbnail";
import type { Messages } from "@/lib/i18n";
import type { UiLocale } from "@/lib/i18n/locales";
import type { InboxPlan } from "@/lib/inbox/plan";

/**
 * `/inbox` 목록 (inbox-page D3·D4) — 헤더 드롭다운과 **같은 `InboxPlan`**을 프로젝트마다 `Card` 하나로 보인다.
 * 날짜 묶음은 없다 — 항목은 사건이 아니라 지금 상태이고, 검토 시각은 push가 덮어 새 검토가 생긴 날을 말하지 못한다.
 *
 * ⚠️ **행 형은 Home `Needs your attention` 카드 행과 같다**(chevron · `text-base` · 행 사이 `--border` 선, 첫 행은 머리 선) — 내용은 같은
 * 공유 조각(`attentionRowSlots`)이고 시각만 긴 형이다. 안 읽음 점이 `absolute`라 행에 `relative`를 준다.
 * 서버 컴포넌트라 사전·화면 언어를 인자로 받는다(Home 카드와 같다).
 */
export function InboxList({ plan, now, m, uiLocale }: { plan: InboxPlan; now: Date; m: Messages; uiLocale: UiLocale }) {
  if (plan.groups.length === 0) {
    return <EmptyState placement="card" icon={CircleCheck} title={m.home.attention.empty.title} description={m.inbox.emptyDescription} />;
  }
  return plan.groups.map(group => (
    <Card key={group.project.slug} title={
      <span className="flex items-center gap-2">
        <ProjectThumbnail size="xs" name={group.project.name} src={group.project.image} />
        {group.project.name}
      </span>
    }>
      <ul>
        {group.items.map(item => {
          const { href, ...slots } = attentionRowSlots(m, uiLocale, group.project.slug, item, now, { time: "long" });
          return (
            // 첫 행은 머리 선 바로 아래라 자기 선을 내려놓는다(Home 카드와 같다).
            <li key={attentionItemKey(group.project.slug, item)} className="[&:first-child>a]:border-t-0">
              <ListRow chevron href={href} className="border-border relative border-t text-base" {...slots} />
            </li>
          );
        })}
      </ul>
    </Card>
  ));
}
