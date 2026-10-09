import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";

import { setColorScheme, type SetColorSchemeResult } from "@/app/color-scheme/actions";
import type { ColorScheme } from "@/lib/color-scheme/scheme";

/** 테마 글리프 — Theme 카드와 공개 푸터 스위처가 같은 셋을 쓴다. */
export const COLOR_SCHEME_GLYPHS: Readonly<Record<ColorScheme, LucideIcon>> = { system: Monitor, light: Sun, dark: Moon };

/**
 * 고른 테마를 **Action보다 먼저** `<html data-theme>`에 쓰고, `ok`가 아니면(던짐 포함) 이전 값으로 되돌린다 (color-scheme design §3.7).
 * 화면은 CSS가 그 속성 하나로 읽으므로 서버 왕복을 기다리지 않는다 — revalidate 뒤 루트 레이아웃이 같은 값을 다시 실어 맞물린다.
 * ⚠️ provider·훅이 아니라 한 줄 DOM 쓰기다(design §3.4 "훅·provider 금지"). ⚠️ 던짐도 되돌린다 — 호출부가 잡아 실패를 말해도 화면만 새 테마로
 * 남으면 고른 값과 화면이 어긋난다.
 */
export async function applyColorScheme(next: ColorScheme): Promise<SetColorSchemeResult> {
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
