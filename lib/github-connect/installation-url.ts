/**
 * `/account`의 [Installation settings] 버튼이 나가는 곳 (DESIGN §6.67).
 *
 * ⚠️ **설치 ID로 가는 주소(`/settings/installations/<id>`)를 쓰지 않는다.** `Account` 모델에 설치 ID
 * 컬럼이 **없고**(`@@id([provider, providerAccountId])` + 토큰 넷뿐), 사용자에게 설치가 여럿일 수
 * 있어 "어느 설치인가"에 답이 없다. `apps/<slug>/installations/new`는 **이미 설치한 계정에서는
 * GitHub이 설정 화면으로 보낸다** — 이 리포의 기존 세 자리가 전부 그 주소다.
 *
 * ⚠️ **`GITHUB_APP_SLUG`가 없으면 `null`이고 그 버튼만 조용히 사라진다** (CLAUDE.md의 `optionalEnv`
 * 계약). 나머지 행은 그대로 선다 — 링크 하나가 없다고 연결 상태를 장애로 위장하지 않는다.
 */
export function installationSettingsUrl(appSlug: string | undefined): string | null {
  // 빈 문자열도 막는다. `optionalEnv`가 이미 `undefined`로 접지만, 타입이 `string`을 허용하는 한
  // 다른 호출부가 `process.env`에서 바로 넘겨 `apps//installations/new`로 나갈 수 있다.
  return appSlug === undefined || appSlug === "" ? null : `https://github.com/apps/${appSlug}/installations/new`;
}

/**
 * ① 주 버튼 [Install GitHub App]의 목적지 (install-and-connect). App 설정 "Request user authorization (OAuth)
 * during installation"이 켜져 있으면 GitHub이 이 `state`를 대상 선택 → 권한 화면 → callback까지 그대로
 * 싣는다 — 설치와 연결(user-to-server 인가)이 **한 왕복**이 된다.
 *
 * ⚠️ **이름이 `installUrl`이 아니다** — `NewProject`·`RepoStep`의 prop `installUrl`은 설치 **설정** 주소다.
 * ⚠️ **`redirect_uri`를 받지 않는 주소다** — 로컬·preview에서 시작해도 App의 첫 callback(프로덕션)으로
 * 간다. 그쪽엔 쿠키가 없어 교환 0회로 거부되므로 환경을 넘는 연결은 생기지 않는다.
 */
export function installWithStateUrl(appSlug: string | undefined, nonce: string): string | null {
  const base = installationSettingsUrl(appSlug);
  if (base === null) return null;
  const url = new URL(base);
  url.searchParams.set("state", nonce);
  return url.toString();
}
