import "server-only";
import { revalidatePath } from "next/cache";
import { logFailure } from "@/lib/github-connect/log";

// DB 커밋 뒤 캐시 장애가 성공한 쓰기를 실패로 뒤집지 않게 한다.
export function revalidateAfterCommit(scope: string, path = "/"): void {
  settleRevalidate(scope, () => revalidatePath(path, "layout"));
}

/**
 * 커밋 뒤 재검증 호출 **하나**를 감싼다 — 던지면 로그만 남긴다. 호출부가 경로·type을 그대로 적어 두려고 콜백을 받는다
 * (`revalidateAfterCommit`은 layout 하나라 페이지 경로를 못 싣는다). 경로마다 따로 감싸야 앞 경로의 실패가 뒤 경로를 건너뛰지 않는다.
 */
export function settleRevalidate(scope: string, revalidate: () => void): void {
  try { revalidate(); }
  catch (error) { logFailure(`${scope}-cache`, error); }
}

/**
 * 보관으로 거부된 설정 쓰기는 **그 프로젝트 세그먼트를 다시 그린 뒤** 거부를 돌려준다 (QA D1, 2026-09-24).
 * Settings를 연 채로 다른 탭이 보관하면 이 화면의 `archived` prop은 옛 값이다 — 거부만 돌려주면 켜진 컨트롤과 Restore 없는
 * 화면이 남는다. 다른 거부(권한·장애)는 보관 상태가 바뀐 것이 아니므로 다시 그리지 않는다.
 */
export function redrawIfArchived<T>(slug: string, status: string, result: T): T {
  if (status === "archived") revalidateAfterCommit("archived-refusal", `/projects/${slug}`);
  return result;
}
