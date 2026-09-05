import "server-only";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getPrisma } from "@/lib/db";

import type { Permission } from "./permission";
import { getProjectAccess } from "./query";

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
  const session = await auth();
  const userId = session?.user?.id;
  if (typeof userId !== "string" || userId === "") redirect("/");
  return { userId };
}

export async function requireProjectAccess(input: {
  slug: string;
  permission: Permission;
}): Promise<{ projectId: string; role: "OWNER" | "EDITOR" }> {
  const { userId } = await requireUser();
  const access = await getProjectAccess(getPrisma(), { userId, ...input });
  // not-found와 forbidden을 같은 곳으로 보낸다 — 목적지 차이로 존재 여부를 알려주지 않는다.
  if (access.status !== "ok") redirect("/projects");
  return { projectId: access.projectId, role: access.role };
}
