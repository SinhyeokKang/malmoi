import { offsetLabel, utcOffsetMinutes } from "@/lib/date-format";

import { TIME_ZONES, type TimeZone } from "./zones";

/**
 * Preferences 시간대 Select의 옵션 — `UTC`가 첫 줄, 나머지는 **`now` 기준 오프셋 오름차순, 같은 오프셋은 id 순**이다.
 * 라벨은 `UTC+9 · Asia/Seoul`이고 id는 번역하지 않는다(세 언어 공통).
 *
 * ⚠️ **오프셋 0은 옵션 라벨에서만 `UTC+0`이다** — 첫 줄 `UTC`와 구분한다. 시각 꼬리(`offsetLabel`)는 그대로 `UTC`다.
 * ⚠️ `now`는 호출부가 넘긴다(서버가 내린 prop) — 렌더 중 `Date.now()`는 서머타임 전환 순간에 서버 렌더와 하이드레이션이 갈린다.
 * ⚠️ 동률 정렬은 `localeCompare`가 아니다 — ICU 로케일에 기대지 않는 코드 단위 비교다.
 */
export function timeZoneOptions(now: Date): { value: TimeZone; label: string }[] {
  const rest = TIME_ZONES.filter((id) => id !== "UTC")
    .map((id) => ({ id, offset: utcOffsetMinutes(now, id) }))
    .sort((a, b) => a.offset - b.offset || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return [
    { value: "UTC", label: "UTC" },
    ...rest.map(({ id, offset }) => ({ value: id, label: `${offset === 0 ? "UTC+0" : offsetLabel(offset)} · ${id}` })),
  ];
}
