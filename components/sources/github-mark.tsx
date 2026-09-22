/**
 * 시안 `1a`의 카드 머리가 저장소 앞에 `data-lucide="github"` 14를 둔다.
 *
 * ⚠️ **`lucide-react` 1.37에 이 글리프가 없다** — 그 버전이 브랜드 아이콘을 통째로 뺐고, 캔버스는
 * lucide 0.462를 물고 있다. 여기 path는 그 버전의 `github` 원본이다. **이 파일이 이 리포의 유일한
 * 브랜드 마크다** — 늘리지 말고, 다른 자리가 생기면 여기서 가져다 쓴다.
 */
export function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}
