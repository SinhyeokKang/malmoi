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
  /** 기준으로 보는 로케일. 집계·상태 필터가 이 로케일을 본다. */
  focus?: string;
  /** 보일 로케일 — `"ko,ja"`. 로케일이 행이 된 뒤 `focus`를 대체한다 (8-4). */
  locales?: string;
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
   * 내 프로젝트 목록. **`filter`는 URL 상태다** (8-3) — 세그먼트가 링크라 뒤로가기·공유·새로고침이
   * 그냥 되고, 서버가 이미 걸러 그리므로 클라이언트 상태가 0이다.
   *
   * ⚠️ **`withQuery`를 지나야 한다** — 문자열 연결로 만들면 `entry-points.test.ts`의 "쿼리 파라미터
   * 수신자" 검사를 통째로 회피한다(위 `signIn` 주석과 같은 이유). 기본값 `all`은 안 싣는다.
   */
  /**
   * ⚠️ **`q`는 이름 검색이다** (2026-09-11) — 번역 화면의 `q`와 이름은 같지만 대상이 다르다
   * (그쪽은 키 + 값, 여기는 프로젝트 이름 하나).
   */
  projects: (query: { filter?: string; q?: string } = {}): string => withQuery("/projects", query),
  newProject: (): string => "/projects/new",
  /**
   * 사용자 축 (SAAS §7.7 — 6b-4). **slug를 받지 않는다** — 프로필과 GitHub 연결은 프로젝트가 아니라
   * 사람에 속하고, 그래서 프로젝트를 하나도 안 만든 사용자도 도달해야 한다.
   *
   * ⚠️ **`sessionRevocation`이 2026-09-11에 여기로 들어왔다.** 그 전에는 세 자리가 문자열 연결로
   * `/account?sessionRevocation=…`을 만들었고 — `signIn()` 주석이 못 박은 바로 그 형태다 —
   * `entry-points.test.ts`의 "쿼리 파라미터 수신자" 검사를 통째로 회피했다. 갈래는 다섯이다
   * (`cancelled`·`wrong-account`·`expired`·`invalid`·`unavailable`).
   */
  account: (query: { sessionRevocation?: string } = {}): string => withQuery("/account", query),
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
