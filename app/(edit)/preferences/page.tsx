import { LanguageCard } from "@/components/preferences/language-card";
import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { requireUser } from "@/lib/auth/session";
import { getMessages } from "@/lib/i18n/server";

/**
 * **Preferences** (`/preferences` — ui-locales design §5.2). 사용자 축이다(`/account`·`/mcp` 옆) — 화면 언어는 사람에게 붙는다.
 *
 * ⚠️ **`requireUser`만 지난다 — 인가할 프로젝트가 없다.** 1차 차단은 `isProtectedPath`가 든다(두 층).
 * ⚠️ **카드가 하나다** — 타임존·테마 자리를 만들지 않는다(spec 비목표 — 확장성 선반영 금지). 제목 = 사이드바 라벨(`m.common.nav.preferences`).
 * ⚠️ **지금 언어를 prop으로 넘기지 않는다** — 카드가 `useUiLocale()`로 읽는다. 루트 레이아웃이 같은 판정(`getUiLocale`)으로 provider를 세우므로
 * 값이 한 벌이고, 언어를 바꾸면 무효화된 레이아웃이 새 값을 내려 준다.
 */
export default async function PreferencesPage() {
  const m = await getMessages();
  await requireUser();

  return (
    <>
      <PanelHeader>
        <h1 className="flex items-center text-lg font-medium">{m.common.nav.preferences}</h1>
      </PanelHeader>
      <PanelBody className="space-y-4">
        <LanguageCard />
      </PanelBody>
    </>
  );
}
