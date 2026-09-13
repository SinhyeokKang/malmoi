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

/**
 * "전체" 네임스페이스의 URL 값. **어댑터가 만들 수 없는 이름**이라 실제 키 접두와 충돌하지 않는다
 * (`all`은 진짜 접두일 수 있다).
 *
 * ⚠️ **2026-09-11에 `lib/keys/view.ts`에서 여기로 내려왔다** (8-4). 칩 판정(`lib/keys/filters.ts`)이
 * "네임스페이스 칩을 떼면 전체로 넓어진다"를 표현하려면 이 값을 알아야 하는데, 그 모듈은 **잎**이라
 * `view.ts`를 물 수 없다(`compareKeys` → `lib/adapters/shared`가 번들에 따라온다 —
 * POSTMORTEM 2026-09-07). URL 값이므로 이 파일이 원래 자리이기도 하다.
 */
export const ALL_NAMESPACES = "*";

/** 번역 화면의 상태는 URL에 있다 — 공유 가능하고 새로고침에 살아남는다 (design §3.3). */
export type TranslationsQuery = {
  /** 네임스페이스. `"*"`는 전체 — 어댑터가 만들 수 없는 이름이라 실제 접두와 충돌하지 않는다. */
  ns?: string;
  /**
   * 보일 로케일 — `"ko,ja"` (8-4).
   *
   * ⚠️ **옛 `focus`를 대체한다.** 그것은 "어느 로케일 **열**을 기준으로 집계·필터하나"였는데,
   * 로케일이 항상 행으로 다 보이면 "기준 열"이라는 개념에 화면의 대응물이 없다. 둘을 공존시키면
   * 집계가 보는 로케일의 답이 둘이 되고 그중 하나가 URL에 안 보이는 상태로 남는다.
   *
   * 옛 `?focus=`는 **무시된다**(기본 선택) — 404도 리다이렉트도 아니다. 더 넓게 보일 뿐이다.
   */
  locales?: string;
  /** 키·**선택된 로케일 값**의 부분 일치. */
  q?: string;
  /**
   * ⚠️ **`state`가 없다** (8-4 — spec Q3). 시안의 칩 행이 정확히 세 종류라 상태 필터의 부재가
   * 의도로 읽힌다. 행 단위 좁힘 대신 **섹션 안 pending 우선 정렬**이 그 자리를 갚는다.
   */
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
  /**
   * 로그인 화면. 세션이 끊긴 채 저장을 시도한 셀이 여기로 보낸다 (design §3.8).
   *
   * ⚠️ **`/`가 아니라 `/signin`이다** (8-1a). 랜딩 페이지가 `/`에 들어올 예정이라 미리 갈랐다 —
   * 나중에 옮기면 이 목적지를 가리키는 **아홉 자리**가 동시에 움직이고, 경로 문자열은 타입이
   * 못 보는 부류라 하나만 빠뜨려도 조용하다 (POSTMORTEM 2026-09-05).
   *
   * ⚠️ **쿼리를 `withQuery`로 만드는 것이 계약의 절반이다.** `entry-points.test.ts`의 "쿼리
   * 파라미터 수신자" 검사는 생성기 호출을 **`routes.foo(...)}?key=`** 모양으로 찾으므로,
   * 문자열 연결(`routes.signIn() + "?error=..."`)로 만들면 **그 검사를 통째로 회피한다** —
   * 사유를 보내놓고 아무도 안 읽는 것이 POSTMORTEM 2026-09-06의 사고다.
   *
   * `error`는 Auth.js의 거부 사유(`signInErrorMessage`), `sessions`는 전체 세션 회수 결과다.
   */
  signIn: (query: { error?: string; sessions?: string } = {}): string => withQuery("/signin", query),
  /**
   * 내 프로젝트 목록. **좁히는 축은 검색 하나다** — 서버가 이미 걸러 그리므로 클라이언트 상태가 0이고,
   * 뒤로가기·공유·새로고침이 그냥 된다.
   *
   * ⚠️ **`filter`가 2026-09-13에 사라졌다** (projects-list §1.2). 옛 링크의 `?filter=`는 **조용히
   * 무시된다** — 404도 리다이렉트도 아니고, 더 넓게 보일 뿐이다. 옛 `?focus=`를 폐기했을 때와 같은
   * 관용구다(위 `TranslationsQuery` 주석).
   *
   * ⚠️ **`withQuery`를 지나야 한다** — 문자열 연결로 만들면 `entry-points.test.ts`의 "쿼리 파라미터
   * 수신자" 검사를 통째로 회피한다(위 `signIn` 주석과 같은 이유).
   *
   * ⚠️ **`q`는 이름 검색이다** (2026-09-11) — 번역 화면의 `q`와 이름은 같지만 대상이 다르다
   * (그쪽은 키 + 값, 여기는 프로젝트 이름 하나).
   */
  projects: (query: { q?: string } = {}): string => withQuery("/projects", query),
  /**
   * 새 프로젝트 모달의 **딥링크** (new-project-modal §1.4). `/projects` 위에 모달이 열린 주소이고,
   * 그래서 목록과 **같은 쿼리**를 받는다 — 뒤 목록이 열기 직전과 같아야 하고, 닫으면 그 값을 들고
   * `/projects`로 돌아간다.
   *
   * ⚠️ **`withQuery`를 지난다** — 문자열 연결로 만들면 `entry-points.test.ts`의 "쿼리 파라미터
   * 수신자" 검사를 통째로 회피한다 (위 `signIn` 주석과 같은 이유).
   */
  newProject: (query: { q?: string } = {}): string => withQuery("/projects/new", query),
  /**
   * 사용자 축 (PRODUCT §7.7 — 6b-4). **slug를 받지 않는다** — 프로필과 GitHub 연결은 프로젝트가 아니라
   * 사람에 속하고, 그래서 프로젝트를 하나도 안 만든 사용자도 도달해야 한다.
   *
   * ⚠️ **`sessionRevocation`이 2026-09-11에 여기로 들어왔다.** 그 전에는 세 자리가 문자열 연결로
   * `/account?sessionRevocation=…`을 만들었고 — `signIn()` 주석이 못 박은 바로 그 형태다 —
   * `entry-points.test.ts`의 "쿼리 파라미터 수신자" 검사를 통째로 회피했다. 갈래는 다섯이다
   * (`cancelled`·`wrong-account`·`expired`·`invalid`·`unavailable`).
   */
  /**
   * ⚠️ **`link`가 2026-09-12에 붙었다** (account-linking T5) — 로그인 수단 해제의 결과다. 갈래는
   * 둘(`disconnected`·`last-method`)이고, 같은 이유로 `withQuery`를 지난다.
   */
  account: (query: { sessionRevocation?: string; link?: string } = {}): string => withQuery("/account", query),
  /**
   * 병합 안내 화면 (account-linking T2). **challenge는 경로에 있다** — 경로 토큰이라 "표시 전용
   * 힌트"라는 애매한 층이 없고, `/invite/[token]`과 같은 부류다.
   *
   * ⚠️ **쿼리를 받는다** — 확인 실패가 `Alert` 문구를 이 화면에 전달해야 하고, 문자열 연결로
   * 만들면 `entry-points.test.ts`의 "쿼리 수신자" 검사를 통째로 회피한다 (`signIn` 주석과 같은 이유).
   *
   * ⚠️ **`middleware.ts`의 matcher에 넣지 않는다** — 비로그인이 봐야 하는 화면이라 넣으면 그
   * 순간 challenge가 사라진다 (`/invite/[token]`과 같은 판단).
   */
  signInLink: (challenge: string, query: { e?: string } = {}): string =>
    withQuery(`/signin/link/${challenge}`, query),
  translations: (slug: string, query: TranslationsQuery = {}): string =>
    withQuery(`/projects/${slug}/translations`, query),
  /**
   * 프로젝트 진입의 **착지점** (PRODUCT §7.7 결정 1 — 6b-6). "프로젝트로 간다"를 뜻하는 자리가 전부
   * 이것이다: 목록 행 · 사이드바 스위처 · 각 화면의 breadcrumb · 초대 수락. 하나라도 다른 곳을
   * 가리키면 같은 의도가 어디서 눌렀는지에 따라 다른 곳에 착지하고, 그 불일치는 눈에 안 보인다.
   */
  project: (slug: string): string => `/projects/${slug}`,
  locales: (slug: string): string => `/projects/${slug}/locales`,
  members: (slug: string): string => `/projects/${slug}/members`,
  /**
   * sync 이력 (7단계). **커서는 서버가 만든 값이고 클라이언트 상태가 아니다** — "Older"가 링크
   * 하나라 뒤로 가기·공유·새로고침이 전부 그냥 된다 (design 결정 14).
   */
  logs: (slug: string, query: { cursor?: string } = {}): string =>
    withQuery(`/projects/${slug}/logs`, query),
  settings: (slug: string): string => `/projects/${slug}/settings`,
  invite: (token: string): string => `/invite/${token}`,
  /**
   * 공개 문서 둘 — **로그인 화면 푸터가 가리킨다.**
   *
   * ⚠️ **아직 placeholder다**(출시 전에 채운다). 그래도 **페이지와 같은 커밋에 등재한다** —
   * 페이지 없이 넣으면 404를 가리키는 생성기가 되고, 죽은 링크 검사의 접두 규칙이 그것을
   * 통과시켜 못 잡는다 (6b-4·6b-6·7단계와 같은 판정).
   */
  privacy: (): string => "/privacy",
  docs: (): string => "/docs",
} as const;
