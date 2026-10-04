"use server";

import { cookies, headers } from "next/headers";

import { readSession } from "@/lib/auth/read-session";
import { getPrisma } from "@/lib/db";
import { describeFailure } from "@/lib/failure";
import { UI_LOCALE_COOKIE, parseUiLocale, planUiLocaleWrite } from "@/lib/i18n/locales";
import { revalidateAfterCommit } from "@/lib/revalidate-after-commit";

/** ⚠️ **문장이 아니라 코드다** — 호출부가 `useMessages()`로 그린다. 무효화 뒤 렌더가 새 언어라 Action이 고른 언어로 문장을 만들 수 없다. */
export type SetUiLocaleResult = "ok" | "invalid" | "failed";

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * **화면 언어 바꾸기** (ui-locales design §4) — 공개 푸터(비로그인 포함)와 `/preferences`가 같이 부른다. 그래서 보호 경로 밖
 * `app/ui-locale/`에 산다(맨 `locale`이 아니다 — 프로젝트 로케일과 다른 축).
 *
 * ⚠️ **순서가 계정 → 쿠키 → 무효화로 고정이다.** 세션을 못 읽었거나 계정 쓰기가 실패하면 **아무것도 쓰지 않고 `failed`**다 —
 * 쿠키만 쓰면 다음 렌더에서 세션이 살아날 때 계정의 옛 값이 쿠키를 이겨(`resolveUiLocale`) 화면이 조용히 되돌아간다.
 * ⚠️ **계정 대상은 세션이 정한다** — 입력에 userId가 없다. `User.uiLocale`은 봉투 대상이 아니다(사람을 식별하지 않는다).
 * ⚠️ 쿠키는 http-only다 — 방침의 "All of them are http-only"가 참이어야 하고, 클라이언트는 provider가 받은 코드를 쓴다.
 * `ProjectEvent`를 남기지 않는다 — 프로젝트 상태가 아니다.
 */
export async function setUiLocale(raw: unknown): Promise<SetUiLocaleResult> {
  const uiLocale = parseUiLocale(raw);
  if (uiLocale === null) return "invalid";

  const session = await readSession();
  if (session.status === "unavailable") return "failed";
  const plan = planUiLocaleWrite({ signedIn: session.status === "ok" });

  if (plan.account && session.status === "ok") {
    try {
      await getPrisma().user.update({ where: { id: session.userId }, data: { uiLocale } });
    } catch (error) {
      console.error("UI locale update failed.", { userId: session.userId, cause: describeFailure(error) });
      return "failed";
    }
  }

  // 프록시가 둘 이상이면 `https,http`처럼 목록으로 온다 — 앞이 클라이언트 쪽이다(`requestOrigin`과 같은 판정).
  const proto = (await headers()).get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  (await cookies()).set(UI_LOCALE_COOKIE, uiLocale, { httpOnly: true, sameSite: "lax", secure: proto === "https", path: "/", maxAge: ONE_YEAR });

  // 루트 레이아웃이 `<html lang>`과 provider를 이 값으로 고른다 — 전 화면이다. 커밋 뒤라 던져도 결과를 뒤집지 않는다.
  revalidateAfterCommit("ui-locale");
  return "ok";
}
