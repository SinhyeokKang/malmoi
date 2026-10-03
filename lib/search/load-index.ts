import type { DocsEntry } from "./docs-index";

let pending: Promise<DocsEntry[]> | null = null;

/** 공개 내용만 탭 수명으로 재사용한다. 실패한 Promise는 다음 열기의 재시도를 막지 않는다. */
export function loadSearchIndex(): Promise<DocsEntry[]> {
  pending ??= fetch("/api/search-index")
    .then(async response => {
      if (!response.ok) throw new Error("Search index unavailable");
      const body: { docs: DocsEntry[] } = await response.json();
      return body.docs;
    })
    .catch(error => {
      pending = null;
      throw error;
    });
  return pending;
}
