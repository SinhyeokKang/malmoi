import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

/**
 * **한 개념 안에서 날짜 형이 갈리지 않는다** (ux-drift-unify 2-Y19). 보관 시각은 날짜만(`utcDay` — Logs의 "Archived on {date}."와 같다),
 * 가입 시점은 달(`utcMonth`)이고 둘 다 `lib/utc-time.ts`가 만든다 — 로케일 포맷터(`Intl`)는 ICU·TZ에 기대므로 화면 코드에 두지 않는다.
 */
it("계정 병합 확인의 가입 시점이 utcMonth다 — Intl을 쓰지 않는다", () => {
  const src = readFileSync("app/signin/link/[challenge]/page.tsx", "utf8");
  expect(src).toContain("utcMonth(");
  expect(src).not.toContain("Intl.");
});

it("Settings 보관 카드의 보관 시각이 날짜만이다", () => {
  const src = readFileSync("app/(edit)/projects/[slug]/settings/page.tsx", "utf8");
  expect(src).toContain("utcDay(project.archivedAt");
  expect(src).not.toContain("utcMinute");
});
