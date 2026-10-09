"use server";

import { readSession } from "@/lib/auth/read-session";
import { getPrisma } from "@/lib/db";
import { describeFailure } from "@/lib/failure";
import { revalidateAfterCommit } from "@/lib/revalidate-after-commit";
import { parseTimeZone } from "@/lib/time-zone/zones";

/** ⚠️ **문장이 아니라 코드다** — 호출부가 `useMessages()`로 그린다(`SetUiLocaleResult`와 같은 형). */
export type SetTimeZoneResult = "ok" | "invalid" | "failed";

/**
 * **시간대 바꾸기** (user-timezone design §6.1) — `/preferences`의 Time zone 카드가 부른다. 로그인 전용이라 보호 경로 아래에 산다.
 *
 * ⚠️ **계정 하나에만 쓴다** — 쿠키 층이 없다(spec 결정). 세션이 `ok`가 아니면 쓸 곳이 없으므로 아무것도 쓰지 않고 `failed`다
 * (redirect하지 않는다 — 카드가 Alert로 말한다). **계정 대상은 세션이 정한다** — 입력에 userId가 없다.
 * ⚠️ **UTC를 골라도 `"UTC"`를 저장한다**(null로 되돌리지 않는다) — 판정 결과가 같고 "고른 적 있음"을 지우는 갈래를 하나 덜 만든다.
 * `ProjectEvent`를 남기지 않는다 — 프로젝트 상태가 아니다. `User.timeZone`은 봉투 대상이 아니다(사람을 식별하지 않는다).
 */
export async function setTimeZone(raw: unknown): Promise<SetTimeZoneResult> {
  const timeZone = parseTimeZone(raw);
  if (timeZone === null) return "invalid";

  const session = await readSession();
  if (session.status !== "ok") return "failed";

  try {
    await getPrisma().user.update({ where: { id: session.userId }, data: { timeZone } });
  } catch (error) {
    console.error("Time zone update failed.", { userId: session.userId, cause: describeFailure(error) });
    return "failed";
  }

  // 루트 레이아웃이 provider에 시간대를 싣는다 — 전 화면이다. 커밋 뒤라 던져도 결과를 뒤집지 않는다.
  revalidateAfterCommit("time-zone");
  return "ok";
}
