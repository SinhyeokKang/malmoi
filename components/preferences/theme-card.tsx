"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";

import { setColorScheme } from "@/app/(edit)/preferences/actions";
import { useMessages } from "@/components/i18n/messages-provider";
import { PreferenceSelectCard } from "@/components/preferences/preference-select-card";
import { COLOR_SCHEMES, parseColorScheme, type ColorScheme } from "@/lib/color-scheme/scheme";

const GLYPHS: Readonly<Record<ColorScheme, LucideIcon>> = { system: Monitor, light: Sun, dark: Moon };

/**
 * 고른 테마를 **Action보다 먼저** `<html data-theme>`에 쓰고, `ok`가 아니면(던짐 포함) 이전 값으로 되돌린다 (color-scheme design §3.7).
 * 화면은 CSS가 그 속성 하나로 읽으므로 서버 왕복을 기다리지 않는다 — revalidate 뒤 루트 레이아웃이 같은 값을 다시 실어 맞물린다.
 * ⚠️ provider·훅이 아니라 한 줄 DOM 쓰기다(design §3.4 "훅·provider 금지"). ⚠️ 던짐도 되돌린다 — 카드가 잡아 Alert를 그려도 화면만 새 테마로
 * 남으면 Select(원래 값)와 화면이 어긋난다.
 */
async function applyColorScheme(next: ColorScheme) {
  const root = document.documentElement;
  const previous = root.dataset.theme;
  const restore = () => {
    if (previous === undefined) delete root.dataset.theme;
    else root.dataset.theme = previous;
  };
  root.dataset.theme = next;
  try {
    const result = await setColorScheme(next);
    if (result !== "ok") restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

/**
 * `/preferences`의 **Theme 카드** (color-scheme design §3.7) — Language · Time zone 아래, 같은 조립(`PreferenceSelectCard`)이다.
 *
 * ⚠️ **`current`는 서버가 정한 값이다**(`getColorScheme` — 계정 > 쿠키 > light). 클라이언트에 테마 provider가 없고 쿠키는 http-only라 읽을 수 없다.
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
        const Glyph = GLYPHS[value];
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
