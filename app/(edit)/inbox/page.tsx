import { InboxList } from "@/components/inbox/inbox-list";
import { MarkSeen } from "@/components/inbox/mark-seen";
import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { getMessages, getUiLocale } from "@/lib/i18n/server";
import { loadAttentionInbox } from "@/lib/inbox/load";

/**
 * **Inbox** (`/inbox` — inbox-page). 헤더 드롭다운과 같은 목록을 URL이 있는 한 장으로 본다. 제목 = 사이드바 라벨(`m.common.nav.inbox`).
 *
 * ⚠️ **`requireUser`만 지난다 — 인가할 프로젝트가 없다.** 범위는 `loadAttentionInbox`의 세션 사용자 멤버십 조회가 정한다. 1차 차단은 `isProtectedPath`다(두 층).
 * ⚠️ **렌더는 아무것도 쓰지 않는다** — 읽음은 마운트 뒤 `MarkSeen`이 기록한다(D1). 조회 실패는 `(edit)/error.tsx` 경계로 간다.
 * ⚠️ **`now`는 조회 전에 잡는다** — 그보다 늦게 생긴 항목을 보지도 않고 읽었다고 기록하지 않는다(열기 Action과 같은 계약). ISO 문자열로 넘긴다.
 */
export default async function InboxPage() {
  const { userId } = await requireUser();
  const now = new Date();
  const plan = await loadAttentionInbox(getPrisma(), userId);
  const [m, uiLocale] = await Promise.all([getMessages(), getUiLocale()]);

  return (
    <>
      <PanelHeader>
        <h1 className="flex items-center text-lg font-medium">{m.common.nav.inbox}</h1>
      </PanelHeader>
      <PanelBody className="space-y-4">
        <InboxList plan={plan} now={now} m={m} uiLocale={uiLocale} />
      </PanelBody>
      <MarkSeen at={now.toISOString()} />
    </>
  );
}
