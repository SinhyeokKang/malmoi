import { loadSearchMembershipsAction, type SearchMembershipsResult } from "@/app/search/actions";

/**
 * 같은 탭에서 멤버십이 바뀔 수 있으므로 성공·실패 모두 다음 열기에 재사용하지 않는다.
 * ⚠️ 실패를 비로그인(null)으로 접지 않는다 — 헤더에 아바타가 있는데 비로그인 화면이 서면 거짓이다(search-ux-unify C1).
 * Action의 union을 그대로 돌려주고, 네트워크 throw만 `unavailable`로 접는다.
 */
export async function loadSearchMemberships(): Promise<SearchMembershipsResult> {
  try {
    return await loadSearchMembershipsAction();
  } catch {
    return { ok: false, error: "unavailable" };
  }
}
