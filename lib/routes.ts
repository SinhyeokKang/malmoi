/**
 * **앱 내부 링크의 단일 출처.**
 *
 * 2026-09-05에 `/keys` → `/projects/[slug]/translations` 이관을 하면서 페이지 안의 링크 생성기가
 * 옛 경로를 하드코딩한 채 남았다 — 사이드바의 네임스페이스·로케일 링크가 전부 404로 갔고
 * **타입도 테스트도 그것을 못 봤다**(문자열이다). 그 사고가 페이지마다 `qs()`를 만들게 했는데,
 * 경로 리터럴이 흩어질 자리가 오히려 늘었다. 여기 모으고 `app/__tests__/entry-points.test.ts`의
 * "죽은 라우트 링크"가 이 파일도 읽는다.
 *
 * ⚠️ **잎 모듈이다** — import가 0이다. 클라이언트 컴포넌트(사이드바·툴바)가 읽으므로 그래프가
 * 곧 번들이다 (`components/__tests__/client-graph.test.ts`).
 */

/** 번역 화면의 상태는 URL에 있다 — 공유 가능하고 새로고침에 살아남는다 (design §3.3). */
export type TranslationsQuery = {
  /** 네임스페이스. `"*"`는 전체 — 어댑터가 만들 수 없는 이름이라 실제 접두와 충돌하지 않는다. */
  ns?: string;
  /** 기준으로 보는 로케일. 집계·상태 필터가 이 로케일을 본다. */
  focus?: string;
  /** 키·값 부분 일치. */
  q?: string;
  /** 상태 필터. */
  state?: "needs-review" | "untranslated";
};

/**
 * `undefined`인 파라미터를 **지운다** — `?ns=undefined`가 URL에 실리면 서버가 그것을 이름으로 읽어
 * 없는 네임스페이스로 떨어진다.
 */
function withQuery(path: string, query: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, value);
  }
  const search = params.toString();
  return search === "" ? path : `${path}?${search}`;
}

export const routes = {
  /** 로그인 화면. 세션이 끊긴 채 저장을 시도한 셀이 여기로 보낸다 (design §3.8). */
  signIn: (): string => "/",
  projects: (): string => "/projects",
  newProject: (): string => "/projects/new",
  /**
   * 사용자 축 (SAAS §7.7 — 6b-4). **slug를 받지 않는다** — 프로필과 GitHub 연결은 프로젝트가 아니라
   * 사람에 속하고, 그래서 프로젝트를 하나도 안 만든 사용자도 도달해야 한다.
   */
  account: (): string => "/account",
  translations: (slug: string, query: TranslationsQuery = {}): string =>
    withQuery(`/projects/${slug}/translations`, query),
  /**
   * 프로젝트 진입의 **착지점** (SAAS §7.7 결정 1 — 6b-6). "프로젝트로 간다"를 뜻하는 자리가 전부
   * 이것이다: 목록 행 · 사이드바 스위처 · 각 화면의 breadcrumb · 초대 수락. 하나라도 다른 곳을
   * 가리키면 같은 의도가 어디서 눌렀는지에 따라 다른 곳에 착지하고, 그 불일치는 눈에 안 보인다.
   */
  project: (slug: string): string => `/projects/${slug}`,
  locales: (slug: string): string => `/projects/${slug}/locales`,
  members: (slug: string): string => `/projects/${slug}/members`,
  settings: (slug: string): string => `/projects/${slug}/settings`,
  invite: (token: string): string => `/invite/${token}`,
} as const;
