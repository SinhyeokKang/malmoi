"use client";

import { useMemo } from "react";

import { setTimeZone } from "@/app/(edit)/preferences/actions";
import { useDateStyle, useMessages } from "@/components/i18n/messages-provider";
import { PreferenceSelectCard } from "@/components/preferences/preference-select-card";
import { formatMinute } from "@/lib/date-format";
import { timeZoneOptions } from "@/lib/time-zone/options";
import { parseTimeZone } from "@/lib/time-zone/zones";

/**
 * `/preferences`의 **Time zone 카드** (user-timezone design §6) — Language 카드 아래, 같은 조립(`PreferenceSelectCard`)이다.
 *
 * ⚠️ **`now`는 서버가 내린 ISO prop이다** — 옵션 정렬(오프셋)과 미리보기가 같은 순간을 쓴다. 렌더 중 `Date.now()`는 서머타임 전환·자정이
 * 서버 렌더와 하이드레이션 사이에 끼면 갈린다(design §0 하이드레이션 ①).
 * ⚠️ **미리보기가 유일한 피드백이다** — 이 페이지엔 다른 날짜가 없다. 낙관 값을 따라가고 실패면 같이 돌아간다. 고른 값을 넘기므로
 * `timeZone: "UTC"` 리터럴을 쓰지 않는다(`date-format-consumers.test.ts`의 고정 표면 목록).
 * ⚠️ **열린 목록의 글자 이동은 도시 이름으로 간다** — 라벨이 전부 `UTC…`로 시작하고 id는 대륙으로 시작해 어느 쪽도 `s`가 서울 쪽으로 가지 않는다.
 * id의 마지막 조각에서 `_`를 공백으로 편 것이다(`New York` · `Buenos Aires` · `UTC`). 화면 언어와 무관하다(id를 번역하지 않는 것과 같다).
 */
export function TimeZoneCard({ now }: { now: string }) {
  const m = useMessages();
  const style = useDateStyle();
  const at = useMemo(() => new Date(now), [now]);
  const items = useMemo(
    () => timeZoneOptions(at).map((option) => ({ ...option, textValue: (option.value.split("/").at(-1) ?? option.value).replaceAll("_", " ") })),
    [at],
  );
  return (
    <PreferenceSelectCard
      title={m.preferences.timeZone.title}
      description={m.preferences.timeZone.description}
      help={m.preferences.timeZone.help}
      failed={m.preferences.timeZone.failed}
      current={style.timeZone}
      parse={parseTimeZone}
      apply={setTimeZone}
      items={items}
      after={(shown) => (
        <p data-time-zone-now className="text-muted-foreground text-xs tabular-nums">
          {m.preferences.timeZone.now(formatMinute(at, { uiLocale: style.uiLocale, timeZone: shown }))}
        </p>
      )}
    />
  );
}
