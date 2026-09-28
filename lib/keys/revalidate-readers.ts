import "server-only";
import { revalidatePath } from "next/cache";

/**
 * 번역 값을 읽는 화면들 — 번역 화면·Sources 진행률·Home, 그리고 목록(`/projects`·`/projects/new`)이다. 편집 UI의 Action과 MCP 도구가
 * **같은 함수로** 지운다(mcp-connector design §1) — 두 벌이면 한쪽에 소비자가 늘 때 다른 쪽이 옛 숫자를 남긴다.
 *
 * ⚠️ **경로를 하나씩 나열하지 않고 세그먼트 레이아웃을 무효화한다** — 나열하면 넷째 소비자가 조용히 빠지고, 저장은 성공했는데
 * 다른 화면이 옛 숫자로 남는다(POSTMORTEM 2026-09-09). 그 세그먼트가 `/projects`를 덮지 않고 `/projects/new`는 모달 뒤에 같은 목록을
 * 그리는 또 다른 경로라 둘을 따로 지운다.
 */
export function revalidateTranslationReaders(slug: string): void {
  revalidatePath(`/projects/${slug}`, "layout");
  revalidatePath("/projects");
  revalidatePath("/projects/new");
}
