import "server-only";

import { redirect } from "next/navigation";

import { getPrisma } from "@/lib/db";

import type { Permission } from "./permission";
import { getProjectAccess } from "./query";
import { readSession } from "./read-session";

/**
 * 세션을 읽는 얇은 껍데기 둘. **판정은 하지 않는다** — 조회는 `getProjectAccess`가, 판정은
 * `planProjectAccess`가 한다. 여기 있는 것은 `redirect()`뿐이라 테스트하지 않는다.
 *
 * ⚠️ **`redirect()`를 던지는 것이 요지다.** 조건부 렌더(`if (!access) return <Denied/>`)로 되돌아가면
 * App Router가 레이아웃과 페이지를 병렬로 렌더해 **페이지가 이미 실행되고 RSC 페이로드가 응답에
 * 실린다** — 실측 1.3MB에 1446키가 노출됐다 (POSTMORTEM 2026-08-31). `redirect`는 렌더를 중단한다.
 *
 * ⚠️ **Server Action에서는 이걸 쓰지 않는다.** blur 저장 중의 redirect는 입력 중인 셀을 날린다 —
 * Action은 `getProjectAccess`를 직접 부르고 결과를 union으로 돌려준다 (design §3).
 */
export async function requireUser(): Promise<{ userId: string }> {
  const session = await readSession();
  // ⚠️ 장애는 `/`가 아니라 `/?error=Unavailable`로 — 그냥 `/`로 보내면 정당한 비로그인과 **바이트 단위로 같은
  // 응답**이 되어 전면 장애가 "리다이렉트 100% = 정상"으로 읽혔다 (POSTMORTEM 2026-09-06).
  if (session.status === "unavailable") redirect("/?error=Unavailable");
  if (session.status === "none") redirect("/");
  return { userId: session.userId };
}

export async function requireProjectAccess(input: {
  slug: string;
  permission: Permission;
}): Promise<{ projectId: string; role: "OWNER" | "EDITOR"; userId: string }> {
  const { userId } = await requireUser();
  const access = await getProjectAccess(getPrisma(), { userId, ...input });
  // not-found와 forbidden을 같은 곳으로 보낸다 — 목적지 차이로 존재 여부를 알려주지 않는다. 사유는 `?e=`로
  // 실어 목록 화면이 한 줄 보인다 — 버리면 사용자는 왜 목록으로 왔는지 모른다 (code-review 2026-09-06 🟡12).
  // 문구 자체가 둘을 같게 말하므로(`accessErrorMessage`) 존재 노출은 없다.
  if (access.status !== "ok") redirect(`/projects?e=${access.status}`);
  // `userId`도 돌려준다 — 호출부가 세션을 다시 읽으면 DB 왕복이 하나 늘고, 무엇보다 **자기 행이
  // 아닌 것을 조회하는 실수**가 열린다 (설정 화면이 `findFirst({ provider })`로 남의 계정을 집을 뻔했다).
  return { projectId: access.projectId, role: access.role, userId };
}
