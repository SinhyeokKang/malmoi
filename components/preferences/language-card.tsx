"use client";

import { useId, useRef, useState, useTransition, type KeyboardEvent } from "react";

import { setUiLocale } from "@/app/ui-locale/actions";
import { useMessages, useUiLocale } from "@/components/i18n/messages-provider";
import { LocaleFlag } from "@/components/translations/locale-badge";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { useLandAfter } from "@/components/ui/focus";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UI_LOCALE_FLAGS, UI_LOCALE_NAMES, UI_LOCALES, parseUiLocale, type UiLocale } from "@/lib/i18n/locales";

/**
 * 닫힌 Radix Select 트리거가 글자 키를 typeahead로 받아 **메뉴를 열지 않은 채 값을 바꾸는** 입력인가 — Radix의 판정 그대로다
 * (`!ctrl·alt·meta && key.length === 1`, Space는 여는 키라 뺀다). 수정자 조합(Cmd+R 등)은 브라우저 것이라 막지 않는다.
 */
function typesAhead(event: KeyboardEvent): boolean {
  return event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.altKey && !event.metaKey;
}

/**
 * `/preferences`의 **Language 카드** (ui-locales design §5.2) — 푸터 스위처와 같은 Action(`setUiLocale`)·같은 동작이다.
 *
 * ⚠️ **고르는 즉시 적용한다(저장 버튼 없음)** — 화면 전체가 새 언어로 다시 그려지는 것이 피드백이라 성공 토스트가 없다(DESIGN §6.4 예외).
 * ⚠️ **그래서 닫힌 트리거의 typeahead를 막는다** — Tab으로 지나가다 `e`를 치면 앱 전체가 Español이 된다(POSTMORTEM 2026-09-19의 두 번째 경로).
 * 닫힌 트리거는 Enter·Space·방향키·Tab만 받는다.
 * ⚠️ **진행 중은 Root `disabled`가 아니라 `RoleSelect` 가드다**(`components/members/member-list.tsx`) — 꺼지면 포커스가 `body`로 빠진다.
 * 트리거는 고른 값을 먼저 보이고(낙관적), 실패하면 원래 값으로 돌아가며 카드 `notice`에 Alert가 선다. 같은 값이면 요청하지 않는다.
 * ⚠️ 라벨 열이 없다 — 카드 제목이 `Language`라 이름은 `aria-labelledby`로 그 제목을, 설명은 `aria-describedby`로 도움말을 가리킨다.
 */
export function LanguageCard() {
  const m = useMessages();
  const uiLocale = useUiLocale();
  const [chosen, setChosen] = useState<UiLocale | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const trigger = useRef<HTMLButtonElement>(null);
  useLandAfter(pending, () => trigger.current);
  const titleId = useId();
  const helpId = useId();
  const shown = chosen ?? uiLocale;

  function choose(raw: string) {
    const next = parseUiLocale(raw);
    if (next === null || pending || next === shown) return;
    setChosen(next);
    setFailed(false);
    startTransition(async () => {
      const result = await setUiLocale(next);
      // await 뒤의 갱신도 전환에 싣는다 — 바로 반영하면 새 언어 트리가 오기 전에 트리거가 옛 값으로 한 번 깜빡인다.
      startTransition(() => {
        setChosen(null);
        setFailed(result !== "ok");
      });
    });
  }

  return (
    <Card
      title={m.uiLocale.label}
      titleId={titleId}
      description={m.preferences.description}
      notice={failed ? <Alert inset variant="danger">{m.uiLocale.failed}</Alert> : undefined}
    >
      <div className="flex flex-col gap-1.5 px-4 py-3">
        <Select value={shown} onValueChange={choose}>
          <SelectTrigger
            ref={trigger}
            width={320}
            aria-labelledby={titleId}
            aria-describedby={helpId}
            aria-disabled={pending || undefined}
            aria-busy={pending || undefined}
            onPointerDown={pending ? (event) => event.preventDefault() : undefined}
            onClick={pending ? (event) => event.preventDefault() : undefined}
            onKeyDown={(event) => {
              // 잠긴 동안은 Tab만 통과시킨다 — 포커스는 남되 나머지는 전부 이 컨트롤의 동작이다(`RoleSelect`와 같다).
              if (pending ? event.key !== "Tab" : typesAhead(event)) event.preventDefault();
            }}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {UI_LOCALES.map((code) => (
              <SelectItem key={code} value={code}>
                {/* 국기가 `ItemText` 안이라 트리거 값으로 함께 복제된다. */}
                <span className="flex items-center gap-2">
                  <LocaleFlag code={UI_LOCALE_FLAGS[code]} />
                  <span lang={code}>{UI_LOCALE_NAMES[code]}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p id={helpId} className="text-muted-foreground text-xs">{m.preferences.help}</p>
      </div>
    </Card>
  );
}
