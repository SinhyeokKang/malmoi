import { LanguageCard } from "@/components/preferences/language-card";
import { ThemeCard } from "@/components/preferences/theme-card";
import { TimeZoneCard } from "@/components/preferences/time-zone-card";
import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { requireUser } from "@/lib/auth/session";
import { getColorScheme } from "@/lib/color-scheme/server";
import { getMessages } from "@/lib/i18n/server";

/**
 * **Preferences** (`/preferences` — ui-locales design §5.2). 사용자 축이다(`/account`·`/mcp` 옆) — 화면 언어는 사람에게 붙는다.
 *
 * ⚠️ **`requireUser`만 지난다 — 인가할 프로젝트가 없다.** 1차 차단은 `isProtectedPath`가 든다(두 층).
 * 카드는 Language · Time zone(user-timezone design §6) · Theme(color-scheme design §3.7) 셋이다. 제목 = 사이드바 라벨(`m.common.nav.preferences`).
 * ⚠️ **지금 언어·시간대를 prop으로 넘기지 않는다** — 카드가 `useUiLocale()`·`useDateStyle()`로 읽는다. 루트 레이아웃이 같은 판정으로 provider를 세우므로
 * 값이 한 벌이고, 바꾸면 무효화된 레이아웃이 새 값을 내려 준다.
 * ⚠️ **테마만 prop이다** — 테마는 provider가 없다(CSS가 `<html data-theme>`을 읽는다, design §3.4). 루트 레이아웃과 같은 `getColorScheme`(요청 캐시)이라
 * 값이 갈리지 않는다.
 * ⚠️ **`now`는 여기서 정해 ISO로 내린다** — 옵션 정렬·미리보기가 같은 순간을 쓰고, 클라이언트가 렌더 중 시계를 읽지 않는다(design §0 하이드레이션 ①).
 */
export default async function PreferencesPage() {
  const m = await getMessages();
  await requireUser();
  const colorScheme = await getColorScheme();
  const now = new Date().toISOString();

  return (
    <>
      <PanelHeader>
        <h1 className="flex items-center text-lg font-medium">{m.common.nav.preferences}</h1>
      </PanelHeader>
      <PanelBody className="space-y-4">
        <LanguageCard />
        <TimeZoneCard now={now} />
        <ThemeCard current={colorScheme} />
      </PanelBody>
    </>
  );
}
