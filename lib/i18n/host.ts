/**
 * **리포 호스트별 문장** (gitlab-repositories tasks §5 · DESIGN §10.1). 호스트가 문장을 고르는 사전 노드는 `onGitLab` 자식에 **같은 이름의
 * 키를 문장 통째로** 두고, 화면은 이 함수로 그 노드를 읽는다 — `forHost(m.home.meta, repoHost).pullRequest`.
 *
 * ⚠️ **호스트 이름 + 조사를 보간하지 않는다** — ko에서 GitHub(깃허브)은 `가·는·를·로`, GitLab(깃랩)은 `이·은·을·으로`다.
 * ⚠️ **호스트 인자 함수(`(host) => …`)로 접지 않는다**(R-E0 🟡) — 사전 스캐너가 함수를 같은 인자로 한 번만 불러 GitLab 갈래를 못 본다.
 * `onGitLab` 자식은 평범한 잎이라 스캐너가 다 걷는다(`host.test.ts`가 두 호스트 낱말이 섞이지 않았는지 센다).
 *
 * ⚠️ 자식 이름이 `gitlab`이 아닌 이유 — `errors.gitlab`·`account.gitlab` 같은 **GitLab 전용 절**(덮지 않는 새 키)과 이름이 겹치면 스캐너·읽는 사람이
 * 둘을 못 가른다. `onGitLab`은 덮기 전용이다.
 * ⚠️ **잎 모듈이다** — 클라이언트가 읽는다. 호스트 값은 문자열로 받는다(`lib/repo-host`를 물지 않는다). 모르는 값은 GitHub이다(열 기본값).
 */
export function forHost<T extends { readonly onGitLab: Partial<Omit<T, "onGitLab">> }>(node: T, host: string): T {
  return host === "gitlab" ? { ...node, ...node.onGitLab } : node;
}
