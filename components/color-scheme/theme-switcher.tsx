"use client";

import { ChevronsUpDown } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { applyColorScheme, COLOR_SCHEME_GLYPHS } from "@/components/color-scheme/apply";
import { useMessages } from "@/components/i18n/messages-provider";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLandAfter } from "@/components/ui/focus";
import { TextTrigger } from "@/components/ui/text-trigger";
import { COLOR_SCHEMES, parseColorScheme, type ColorScheme } from "@/lib/color-scheme/scheme";

/**
 * 각 테마의 라벨·글리프가 **자기 `data-theme`에서만** 보이게 하는 클래스. Tailwind가 리터럴로 찾아야 해서 값마다 통째로 적는다.
 * ⚠️ 보이지 않는 둘은 `display: none`이라 접근 이름에서도 빠진다 — 이름은 sr-only 접두 + 보이는 하나다.
 */
const SHOWN: Readonly<Record<ColorScheme, string>> = {
  system: "hidden [[data-theme=system]_&]:inline",
  light: "hidden [[data-theme=light]_&]:inline",
  dark: "hidden [[data-theme=dark]_&]:inline",
};

const currentScheme = () => parseColorScheme(document.documentElement.dataset.theme);

/**
 * **공개 푸터의 테마 스위처** — `LocaleSwitcher` 오른쪽, 같은 프리미티브(`TextTrigger` + `DropdownMenuItem selected` 셋)·같은 진행 형이다.
 *
 * ⚠️ **지금 테마를 prop으로 받지 않는다** — 화면 테마의 유일한 입구가 `<html data-theme>`이다(color-scheme design §3.4). 트리거 라벨은 CSS가 그
 * 속성으로 셋 중 하나만 보이고(서버가 단 속성과 첫 HTML이 어긋나지 않는다), 메뉴 체크는 **열 때** 그 속성을 읽는다. prop으로 받으면 푸터를 그리는
 * 셸 둘과 그 페이지 전부가 테마를 실어 날라야 하고, 고른 직후 revalidate가 끝날 때까지 라벨이 옛 값에 머문다.
 * ⚠️ 비로그인도 고를 수 있다 — Action이 기기 쿠키만 쓴다. 화면은 Theme 카드와 같은 `applyColorScheme`이 먼저 바꾸고 실패하면 되돌린다.
 * ⚠️ 성공 토스트가 없다 — 화면 전체가 바뀌는 것이 피드백이다. 실패만 토스트다(푸터 40 한 줄에 Alert 자리가 없다).
 * ⚠️ 진행 중은 `busy`이고 끝나면 `useLandAfter`로 트리거에 착지한다 — 진짜 `disabled`면 메뉴가 닫히며 돌려준 포커스가 `body`로 빠진다.
 */
export function ThemeSwitcher() {
  const m = useMessages();
  const t = m.preferences.theme;
  const [pending, startTransition] = useTransition();
  const [checked, setChecked] = useState<ColorScheme | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useLandAfter(pending, () => trigger.current);

  function choose(next: ColorScheme) {
    // 같은 값이면 요청하지 않는다 — 무효화가 전 화면을 다시 그린다.
    if (next === currentScheme() || pending) return;
    startTransition(async () => {
      // ⚠️ 던져도 그 자리에서 말한다 — transition 안의 예외(배포 skew·오프라인·5xx)가 error boundary로 올라가면 페이지 전체가 오류 화면이 된다.
      let result: Awaited<ReturnType<typeof applyColorScheme>> | null;
      try { result = await applyColorScheme(next); } catch { result = null; }
      if (result !== "ok") toast.error(t.failed);
    });
  }

  return (
    <DropdownMenu onOpenChange={(open) => { if (open) setChecked(currentScheme()); }}>
      <DropdownMenuTrigger asChild>
        <TextTrigger ref={trigger} busy={pending}>
          {/* 앞 글리프 묶음은 진행 중 스피너로 교체된다(`TextTrigger`) — 첫 자식이고 `aria-hidden`이어야 한다. `contents`라 보이는 글리프가 버튼의 flex 항목이 된다. */}
          <span aria-hidden className="contents">
            {COLOR_SCHEMES.map((value) => {
              const Glyph = COLOR_SCHEME_GLYPHS[value];
              return <Glyph key={value} className={`size-3.5 ${SHOWN[value]}`} />;
            })}
          </span>
          <span className="sr-only">{t.title}: </span>
          {COLOR_SCHEMES.map((value) => <span key={value} className={SHOWN[value]}>{t.options[value]}</span>)}
          <ChevronsUpDown className="size-3.5" aria-hidden />
        </TextTrigger>
      </DropdownMenuTrigger>
      {/* 푸터가 화면 바닥이라 위로 연다. 줄의 마지막 항목이라 끝 정렬이다(`DropdownMenuContent` 주석). */}
      <DropdownMenuContent side="top" align="end">
        {COLOR_SCHEMES.map((value) => {
          const Glyph = COLOR_SCHEME_GLYPHS[value];
          return (
            <DropdownMenuItem key={value} selected={value === checked} onSelect={() => choose(value)}>
              <Glyph className="size-4" aria-hidden />
              <span>{t.options[value]}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
