import { redirect } from "next/navigation";

import { landingTarget } from "@/lib/auth/landing";
import { readSession } from "@/lib/auth/read-session";

/**
 * **루트는 껍데기다** (8-1a). 로그인 화면은 `/signin`이 그리고, 여기는 착지만 정한다.
 *
 * ⚠️ **랜딩 페이지가 들어올 자리다.** 그때 이 파일이 랜딩이 되고 아래 redirect 한 줄이 사라진다 —
 * 그 전환을 싸게 만들려고 8-1a가 `/signin`을 미리 갈랐다.
 *
 * ⚠️ **로그인 상태로 오면 `/projects`이고, 랜딩이 선 뒤에도 그렇다** — *"로그인 이후 랜딩 못 가게"*가
 * 2026-09-10 사용자 결정이다. 판정은 `landingTarget`이 든다(세 파일에 흩어져 있던 것을 모았다).
 *
 * ⚠️ **`?error=`·`?sessions=`를 여기서 읽지 않는다.** 그 쿼리를 실어 보내는 자리는 전부
 * `routes.signIn({...})`을 지나 `/signin`으로 가고, 여기로 오면 이 redirect가 **쿼리를 버린다.**
 */
export default async function Root() {
  const session = await readSession();
  redirect(landingTarget(session.status));
}
