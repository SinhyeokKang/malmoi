import { loadSearchMembershipsAction } from "@/app/search/actions";
import type { NavProject } from "@/lib/shell/nav";

/** 같은 탭에서 멤버십이 바뀔 수 있으므로 성공·실패 모두 다음 열기에 재사용하지 않는다. */
export async function loadSearchMemberships(): Promise<NavProject[] | null> {
  try {
    const result = await loadSearchMembershipsAction();
    return result.ok ? result.memberships : null;
  } catch {
    return null;
  }
}
