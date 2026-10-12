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

/**
 * **사전 전체를 리포 호스트로 덮는다** — `onGitLab`을 가진 모든 노드에 `forHost`를 적용한 사전. 프로젝트 화면은 인가 뒤 이 사전을 쓴다(서버:
 * `withRepoHost(await getMessages(), project.repoHost)` · 클라이언트: `RepoHostScope`) — 그러면 그 프로젝트의 화면 전체가 한 호스트의 문장을
 * 말하고, 컴포넌트가 낱말마다 호스트를 고르지 않는다(한 프로젝트 화면에 두 호스트 낱말이 섞이지 않는다 — DESIGN §10.1).
 *
 * ⚠️ 호스트가 섞인 화면(`/projects` 목록·Inbox)은 이것을 쓰지 않고 행마다 `forHost`를 부른다. ⚠️ 같은 사전 객체면 같은 결과 객체다(memo) —
 * 클라이언트 context 값이 렌더마다 바뀌지 않는다. ⚠️ JSX 값(`$$typeof`)·배열·함수는 그대로 둔다 — 덮기는 평범한 객체 노드만이다.
 */
const overlaid = new WeakMap<object, object>();

export function withRepoHost<T extends object>(m: T, host: string): T {
  if (host !== "gitlab") return m;
  const found = overlaid.get(m);
  if (found !== undefined) return found as T;
  const made = overlay(m) as T;
  overlaid.set(m, made);
  return made;
}

function plain(node: unknown): node is Record<string, unknown> {
  return node !== null && typeof node === "object" && !Array.isArray(node) && !("$$typeof" in node);
}

function overlay(node: unknown): unknown {
  if (!plain(node)) return node;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(node)) out[key] = key === "onGitLab" ? child : overlay(child);
  return Object.hasOwn(node, "onGitLab") ? merge(out, overlay(node.onGitLab)) : out;
}

/**
 * ⚠️ **덮기는 깊다** — `onGitLab: { held: { "open-pr": … } }`처럼 코드 키 표(`held`·`deferReasons`)의 **일부만** 덮을 수 있다. 코드 키 표 안에
 * `onGitLab`을 두면 그 표를 코드로 훑는 소비자(`satisfies Record<…>`·`pick`)가 낯선 키를 만난다 — 그래서 덮기는 표의 부모에 둔다.
 * (`forHost`는 얕다 — 타입이 같은 이름·같은 형을 강제하는 단순한 자리용이다.)
 */
function merge(base: Record<string, unknown>, top: unknown): Record<string, unknown> {
  if (!plain(top)) return base;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(top)) out[key] = plain(value) && plain(out[key]) ? merge(out[key], value) : value;
  return out;
}
