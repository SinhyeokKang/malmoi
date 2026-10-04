import { describe, expect, it } from "vitest";

import { relativeTime } from "../relative-time";

/**
 * 상대 시각은 **화면 언어로** 말한다(ui-locales spec 완료 조건 9) — 문자열은 `Intl.RelativeTimeFormat`이 만들고 언어 인자만 받는다.
 * 경계(초 → 분 → 시간 → 일)는 언어와 무관하다. ⚠️ 기댓값은 Node ICU의 CLDR 문자열이다 — Node를 올려 붉어지면 눈으로 보고 갱신한다.
 */
describe("relativeTime — 세 언어", () => {
  const now = new Date("2026-09-08T12:00:00Z");
  const at = (iso: string) => new Date(iso);
  const table: Array<[then: string, en: string, ko: string, es: string]> = [
    ["2026-09-08T11:59:10Z", "now", "지금", "ahora"], // 50초 — 초를 읽지 않는다
    ["2026-09-08T11:59:00Z", "1 minute ago", "1분 전", "hace 1 minuto"], // 60초 경계
    ["2026-09-08T11:05:00Z", "55 minutes ago", "55분 전", "hace 55 minutos"],
    ["2026-09-08T11:00:00Z", "1 hour ago", "1시간 전", "hace 1 hora"], // 3600초 경계
    ["2026-09-07T13:00:00Z", "23 hours ago", "23시간 전", "hace 23 horas"],
    ["2026-09-07T12:00:00Z", "yesterday", "어제", "ayer"], // 86400초 경계
    ["2026-09-14T12:00:00Z", "in 6 days", "6일 후", "dentro de 6 días"], // 미래도 던지지 않는다
  ];

  it.each(table)("%s → en %s · ko %s · es %s", (then, en, ko, es) => {
    expect(relativeTime(at(then), now, "en")).toBe(en);
    expect(relativeTime(at(then), now, "ko")).toBe(ko);
    expect(relativeTime(at(then), now, "es")).toBe(es);
  });

  it("언어를 넘기지 않으면 en이다 — 이행 중 기존 호출부의 출력이 바뀌지 않는다", () => {
    expect(relativeTime(at("2026-09-06T12:00:00Z"), now, "en")).toBe("2 days ago");
  });
});
