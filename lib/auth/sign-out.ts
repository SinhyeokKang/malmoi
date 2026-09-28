import "server-only";

import { signOut } from "@/auth";

/**
 * 로그아웃 Action — 앱 셸(`app/(edit)/layout.tsx`)과 공개 셸 헤더가 사용자 메뉴에 **참조로** 넘긴다. 그래야 클라이언트 메뉴가 `@/auth`를 물지 않는다.
 *
 * ⚠️ **`/`가 맞다 — 이관 누락이 아니다** (2026-09-10 사용자). **로그아웃은 랜딩에 착지한다**
 * (2026-09-26부터 `/`가 랜딩이다 — 세션이 없으니 `rootView`가 랜딩을 그린다).
 * `routes.signIn()`으로 바꾸면 그 결정이 조용히 뒤집힌다.
 *
 * ⚠️ **파일이 아니라 함수 단위 `"use server"`다** — 인가가 필요 없는 유일한 Action이라 `app/**\/actions.ts`의 export 단위 인가 검사
 * (`app/__tests__/entry-points.test.ts`) 대상이 아니다. 두 벌이던 인라인 정의를 한 곳으로 모았다.
 */
export async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/" });
}
