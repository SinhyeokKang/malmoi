"use client";

import { setUiLocale } from "@/app/ui-locale/actions";
import { useMessages, useUiLocale } from "@/components/i18n/messages-provider";
import { PreferenceSelectCard } from "@/components/preferences/preference-select-card";
import { LocaleFlag } from "@/components/translations/locale-badge";
import { UI_LOCALE_FLAGS, UI_LOCALE_NAMES, UI_LOCALES, parseUiLocale } from "@/lib/i18n/locales";

/**
 * `/preferences`의 **Language 카드** (ui-locales design §5.2) — 푸터 스위처와 같은 Action(`setUiLocale`)·같은 동작이다.
 * 즉시 적용·typeahead 차단·진행 중 가드·실패 복귀는 `PreferenceSelectCard`가 든다.
 *
 * ⚠️ **성공 토스트가 없다** — 화면 전체가 새 언어로 다시 그려지는 것이 피드백이다(DESIGN §6.4 예외).
 */
export function LanguageCard() {
  const m = useMessages();
  const uiLocale = useUiLocale();
  return (
    <PreferenceSelectCard
      title={m.uiLocale.label}
      description={m.preferences.description}
      help={m.preferences.help}
      failed={m.uiLocale.failed}
      current={uiLocale}
      parse={parseUiLocale}
      apply={setUiLocale}
      items={UI_LOCALES.map((code) => ({
        value: code,
        // 국기가 `ItemText` 안이라 트리거 값으로 함께 복제된다.
        label: (
          <span className="flex items-center gap-2">
            <LocaleFlag code={UI_LOCALE_FLAGS[code]} />
            <span lang={code}>{UI_LOCALE_NAMES[code]}</span>
          </span>
        ),
      }))}
    />
  );
}
