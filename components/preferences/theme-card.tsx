"use client";

import { applyColorScheme, COLOR_SCHEME_GLYPHS } from "@/components/color-scheme/apply";
import { useMessages } from "@/components/i18n/messages-provider";
import { PreferenceSelectCard } from "@/components/preferences/preference-select-card";
import { COLOR_SCHEMES, parseColorScheme, type ColorScheme } from "@/lib/color-scheme/scheme";

/**
 * `/preferences`의 **Theme 카드** (color-scheme design §3.7) — Language · Time zone 아래, 같은 조립(`PreferenceSelectCard`)이다.
 *
 * ⚠️ **`current`는 서버가 정한 값이다**(`getColorScheme` — 계정 > 쿠키 > system). 클라이언트에 테마 provider가 없고 쿠키는 http-only라 읽을 수 없다.
 * ⚠️ 성공 토스트가 없다 — 화면 전체가 바뀌는 것이 피드백이다(DESIGN §6.4 예외).
 */
export function ThemeCard({ current }: { current: ColorScheme }) {
  const m = useMessages();
  const t = m.preferences.theme;
  return (
    <PreferenceSelectCard
      title={t.title}
      description={t.description}
      help={t.help}
      failed={t.failed}
      current={current}
      parse={parseColorScheme}
      apply={applyColorScheme}
      items={COLOR_SCHEMES.map((value) => {
        const Glyph = COLOR_SCHEME_GLYPHS[value];
        return {
          value,
          // 글리프가 `ItemText` 안이라 트리거 값으로 함께 복제된다(Language 카드의 국기와 같은 자리).
          label: (
            <span className="flex items-center gap-2">
              <Glyph className="size-4" aria-hidden />
              <span>{t.options[value]}</span>
            </span>
          ),
        };
      })}
    />
  );
}
