import "server-only";
import { revalidatePath } from "next/cache";
import { logFailure } from "@/lib/github-connect/log";

// DB 커밋 뒤 캐시 장애가 성공한 쓰기를 실패로 뒤집지 않게 한다.
export function revalidateAfterCommit(scope: string, _ownerId: string, path = "/"): void {
  try { revalidatePath(path, "layout"); }
  catch (error) { logFailure(`${scope}-cache`, error); }
}
