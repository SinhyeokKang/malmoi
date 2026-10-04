import type { UiLocale } from "@/lib/i18n/locales";

import type { DocsEntry } from "./docs-index";

// 화면 언어마다 색인이 다르다 — 키가 언어다. 언어를 바꿨다 돌아와도 받은 색인을 다시 받지 않는다.
const pending = new Map<UiLocale, Promise<DocsEntry[]>>();

/** 공개 내용만 탭 수명으로 재사용한다. 실패한 Promise는 다음 열기의 재시도를 막지 않는다. */
export function loadSearchIndex(uiLocale: UiLocale): Promise<DocsEntry[]> {
  const cached = pending.get(uiLocale);
  if (cached) return cached;
  const request = fetch(`/api/search-index/${uiLocale}`)
    .then(async response => {
      if (!response.ok) throw new Error("Search index unavailable");
      const body: { docs: DocsEntry[] } = await response.json();
      return body.docs;
    })
    .catch(error => {
      pending.delete(uiLocale);
      throw error;
    });
  pending.set(uiLocale, request);
  return request;
}
