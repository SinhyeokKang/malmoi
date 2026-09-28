import "server-only";
import { revalidatePath } from "next/cache";

import { logFailure } from "@/lib/github-connect/log";

/**
 * 번역 값을 읽는 화면들 — 번역 화면·Sources 진행률·Home, 그리고 목록(`/projects`·`/projects/new`)이다. 편집 UI의 Action과 MCP 도구가
 * **같은 함수로** 지운다(mcp-connector design §1) — 두 벌이면 한쪽에 소비자가 늘 때 다른 쪽이 옛 숫자를 남긴다.
 *
 * ⚠️ **경로를 하나씩 나열하지 않고 세그먼트 레이아웃을 무효화한다** — 나열하면 넷째 소비자가 조용히 빠지고, 저장은 성공했는데
 * 다른 화면이 옛 숫자로 남는다(POSTMORTEM 2026-09-09). 그 세그먼트가 `/projects`를 덮지 않고 `/projects/new`는 모달 뒤에 같은 목록을
 * 그리는 또 다른 경로라 둘을 따로 지운다.
 * ⚠️ **커밋 뒤에 불린다 — 던지지 않는다** (POSTMORTEM 2026-09-20, `revalidateAfterCommit`과 같은 규칙). 캐시 장애가 이미 커밋된
 * 저장을 실패로 뒤집으면 사용자는 같은 값을 다시 넣는다. 경로마다 따로 잡아 앞 경로의 실패가 뒤 경로를 건너뛰지 않게 한다.
 */
export function revalidateTranslationReaders(slug: string): void {
  settle(() => revalidatePath(`/projects/${slug}`, "layout"));
  settle(() => revalidatePath("/projects"));
  settle(() => revalidatePath("/projects/new"));
}

function settle(revalidate: () => void): void {
  try { revalidate(); }
  catch (error) { logFailure("translation-readers-cache", error); }
}
