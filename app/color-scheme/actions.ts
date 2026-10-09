"use server";

import { readSession } from "@/lib/auth/read-session";
import { setColorSchemeCookie } from "@/lib/color-scheme/cookie";
import { parseColorScheme } from "@/lib/color-scheme/scheme";
import { getPrisma } from "@/lib/db";
import { describeFailure } from "@/lib/failure";
import { revalidateAfterCommit } from "@/lib/revalidate-after-commit";

/** ⚠️ **문장이 아니라 코드다** — 호출부가 `useMessages()`로 그린다(`SetUiLocaleResult`와 같은 형). */
export type SetColorSchemeResult = "ok" | "invalid" | "failed";

/**
 * **화면 테마 바꾸기** (color-scheme design §3.6) — 공개 푸터(비로그인 포함)와 `/preferences`의 Theme 카드가 같이 부른다. 그래서 보호 경로 밖
 * `app/color-scheme/`에 산다(`setUiLocale`과 같은 자리·같은 형).
 *
 * ⚠️ **순서가 계정 → 쿠키 → 무효화로 고정이다.** 세션을 못 읽었거나(`unavailable`) 계정 쓰기가 실패하면 **아무것도 쓰지 않고 `failed`**다 —
 * 쿠키만 쓰면 다음 렌더에서 세션이 살아날 때 계정의 옛 값이 쿠키를 이겨(`resolveColorScheme`) 화면이 조용히 되돌아간다. 비로그인은 쿠키만 쓴다.
 * redirect하지 않는다(푸터는 토스트, 카드는 Alert로 말한다). **계정 대상은 세션이 정한다** — 입력에 userId가 없다.
 * ⚠️ 쿠키는 http-only다(방침의 "All of them are http-only") — 화면은 쿠키가 아니라 `<html data-theme>`을 읽고, 호출부가 그 속성을 먼저 바꾼다.
 * `ProjectEvent`를 남기지 않는다 — 프로젝트 상태가 아니다. `User.colorScheme`은 봉투 대상이 아니다(사람을 식별하지 않는다).
 */
export async function setColorScheme(raw: unknown): Promise<SetColorSchemeResult> {
  const colorScheme = parseColorScheme(raw);
  if (colorScheme === null) return "invalid";

  const session = await readSession();
  if (session.status === "unavailable") return "failed";

  if (session.status === "ok") {
    try {
      await getPrisma().user.update({ where: { id: session.userId }, data: { colorScheme } });
    } catch (error) {
      console.error("Color scheme update failed.", { userId: session.userId, cause: describeFailure(error) });
      return "failed";
    }
  }

  await setColorSchemeCookie(colorScheme);

  // 루트 레이아웃이 `<html data-theme>`을 이 값으로 단다 — 전 화면이다. 커밋 뒤라 던져도 결과를 뒤집지 않는다.
  revalidateAfterCommit("color-scheme");
  return "ok";
}
