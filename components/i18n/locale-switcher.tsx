"use client";

import { ChevronsUpDown, Globe } from "lucide-react";
import { useRef, useTransition } from "react";
import { toast } from "sonner";

import { setUiLocale, type SetUiLocaleResult } from "@/app/ui-locale/actions";
import { useMessages, useUiLocale } from "@/components/i18n/messages-provider";
import { LocaleFlag } from "@/components/translations/locale-badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLandAfter } from "@/components/ui/focus";
import { TextTrigger } from "@/components/ui/text-trigger";
import { UI_LOCALE_FLAGS, UI_LOCALE_NAMES, UI_LOCALES, type UiLocale } from "@/lib/i18n/locales";

/**
 * **공개 푸터의 언어 스위처** (ui-locales design §5.1) — `PublicFooter`의 오른쪽 끝 항목이라 공개 셸과 `AuthLayout` 둘에 선다.
 *
 * ⚠️ **새 프리미티브가 아니라 `DropdownMenuItem selected` 셋이다** — 항목이 셋이라 검색 입력이 필요 없다. 트리거는 `TextTrigger`(푸터 링크와 같은 400).
 * ⚠️ **글리프는 `Globe`다** — 처음 온 사용자는 항상 영어라 영어를 못 읽는 사람이 찾는 단서가 글자가 아니라 아이콘이다. `Languages`는 Translations의 글리프다.
 * ⚠️ **접근 이름에 `aria-label`을 쓰지 않는다** — 보이는 글자를 이름에 담는다(WCAG 2.5.3): sr-only `Language: ` + 보이는 endonym.
 * ⚠️ **언어 이름마다 `lang`을 단다** — ko 화면에서 `English`·`Español`이 한국어 음성으로 읽히지 않게 한다.
 * ⚠️ 성공 토스트가 없다 — 같은 페이지가 새 언어로 다시 그려지는 것이 피드백이다. 실패만 토스트다(푸터 40 한 줄에 Alert 자리가 없다).
 * ⚠️ 진행 중은 `busy`이고 끝나면 `useLandAfter`로 트리거에 착지한다 — 진짜 `disabled`면 메뉴가 닫히며 돌려준 포커스가 `body`로 빠진다.
 */
export function LocaleSwitcher() {
  const m = useMessages();
  const uiLocale = useUiLocale();
  const [pending, startTransition] = useTransition();
  const trigger = useRef<HTMLButtonElement>(null);
  useLandAfter(pending, () => trigger.current);

  function choose(next: UiLocale) {
    // 같은 값이면 요청하지 않는다 — 무효화가 전 화면을 다시 그린다.
    if (next === uiLocale || pending) return;
    startTransition(async () => {
      /*
        ⚠️ **던져도 그 자리에서 말한다** (R10 🔴1 · audit #24) — try가 없으면 transition 안의 예외(배포 skew로 Action id 불일치·오프라인·5xx)가
        error boundary로 올라가 페이지 전체가 오류 화면이 된다. 영어를 못 읽어 언어부터 바꾸는 사람이 먼저 맞는 경로다. `failed`와 같은 갈래다.
      */
      let result: SetUiLocaleResult | null;
      try { result = await setUiLocale(next); } catch { result = null; }
      if (result !== "ok") toast.error(m.uiLocale.failed);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <TextTrigger ref={trigger} busy={pending}>
          {/* 앞 글리프는 진행 중 스피너로 교체된다(`TextTrigger`) — 첫 자식이고 `aria-hidden`이어야 한다. */}
          <Globe className="size-3.5" aria-hidden />
          <span className="sr-only">{m.uiLocale.label}: </span>
          <span lang={uiLocale}>{UI_LOCALE_NAMES[uiLocale]}</span>
          <ChevronsUpDown className="size-3.5" aria-hidden />
        </TextTrigger>
      </DropdownMenuTrigger>
      {/* 푸터가 화면 바닥이라 위로 연다. 오른쪽 끝 항목이라 끝 정렬이다(`DropdownMenuContent` 주석). */}
      <DropdownMenuContent side="top" align="end">
        {UI_LOCALES.map((code) => (
          <DropdownMenuItem key={code} selected={code === uiLocale} onSelect={() => choose(code)}>
            <LocaleFlag code={UI_LOCALE_FLAGS[code]} />
            <span lang={code}>{UI_LOCALE_NAMES[code]}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
