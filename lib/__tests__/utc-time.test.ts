import { expect, it } from "vitest";
import { utcMinute } from "../utc-time";

/**
 * **절대 시각은 UTC라고 말한다** (launch-readiness L7.1 결정). 서버 렌더의 `toLocaleString`은 서버 타임존(Vercel은 UTC)일 뿐이고,
 * 클라이언트의 로컬 표시는 라벨이 없으면 **보는 사람이 어느 시간대인지 모른다** — Logs 화면의 형이 정본이다.
 */
it("분 단위로 자르고 UTC 라벨을 붙인다 — 실행 환경의 타임존과 무관하다", () => {
  expect(utcMinute(new Date("2026-09-10T12:00:59.999Z"))).toBe("2026-09-10 12:00 UTC");
  expect(utcMinute(new Date("2026-09-10T23:59:00+09:00"))).toBe("2026-09-10 14:59 UTC");
});
