import "server-only";
import { OAuthApp } from "@octokit/oauth-app";
import { Octokit } from "octokit";

import { requireEnv } from "@/lib/env";

/**
 * **user-to-server 토큰으로 GitHub을 읽는 껍데기**. 판정은 하지 않는다 —
 * 무엇이 허용인지는 `planRepoConnect`가, 토큰을 쓸지 갱신할지는 `planTokenUse`가 정한다.
 *
 * ⚠️ **App 개인키를 모른다.** 여기서 쓰는 것은 App의 **OAuth client id/secret**이고
 * (`GITHUB_APP_CLIENT_ID` ≠ `GITHUB_APP_ID`), 커밋을 만드는 installation 토큰은
 * `lib/github.ts`에만 산다 (ARCHITECTURE §0-6). `__tests__/credential-separation.test.ts`가 소스에서 센다.
 *
 * ⚠️ **GET만 부른다.** 교환·갱신의 POST는 `OAuthApp`이 대신하고, 우리 코드가 조립하는 요청은
 * 전부 읽기다. 사용자 토큰이 쓰기 경로에 들어가면 커밋이 개인 명의가 된다 (ARCHITECTURE §6).
 *
 * 단위 테스트가 없다 — fetch 모킹 비용이 가치를 넘는다. 검증은 `credential-separation`의 소스
 * 대조와 T3의 실물 왕복이 나눠 맡는다 (`lib/github.ts`가 스모크에 기대는 것과 같은 구조).
 */

export type UserTokens = {
  accessToken: string;
  /** 만료를 끈 App이면 없다. `planTokenUse`가 그때 `reauthorize`로 간다. */
  refreshToken: string | null;
  expiresAt: Date | null;
};

/**
 * ⚠️ **지연 생성.** 모듈 최상위나 기본값 인자에서 환경변수를 읽지 않는다 — "파일을 읽기만 해도
 * 죽는다"가 되고 `.env`가 없는 CI에서 import만으로 실패한다 (POSTMORTEM 2026-08-31 + 🔁 2건).
 */
/**
 * ⚠️ **`octokit`이 재수출하는 `OAuthApp`을 쓸 수 없다.** 그것은 `OAuthApp.defaults({ clientType:
 * "oauth-app" })`로 고정된 클래스라 `clientType: "github-app"`을 넘기면 타입이 `never`로 접힌다
 * (`defaults`로 다시 바꾸는 것도 안 된다 — 실측). 그래서 `@octokit/oauth-app`을 **직접 의존성으로
 * 승격**했다: 이미 `octokit`의 전이 의존성으로 트리에 있던 같은 버전이고, pnpm strict에서는 명시하지
 * 않으면 import할 수 없다. 손으로 인터페이스를 흉내 내는 대안은 라이브러리가 바뀌어도 컴파일러가
 * 침묵하는 부류라 택하지 않았다 (POSTMORTEM 2026-08-31 — 리터럴 조립).
 */
function createOAuthApp() {
  return new OAuthApp({
    clientType: "github-app",
    // ⚠️ `GITHUB_APP_ID`(숫자)가 아니라 client id(`Iv23li…`)다. 바꿔 넣으면 authorize가 404이고,
    // 프로덕션 로그인이 같은 실수로 한 번도 성공한 적이 없었다 (2단계).
    clientId: requireEnv("GITHUB_APP_CLIENT_ID"),
    clientSecret: requireEnv("GITHUB_APP_CLIENT_SECRET"),
  });
}

function userOctokit(accessToken: string): Octokit {
  return new Octokit({ auth: accessToken });
}

/**
 * ⚠️ **`authentication`을 통째로 저장하지 않는다.** `@octokit/oauth-app`은 그 객체에 `clientId`와
 * **`clientSecret`을 함께 담아 준다** — 그대로 `Account` 행에 넣으면 App 시크릿이 DB에 눕고,
 * 로그에 찍으면 그대로 샌다. 필요한 셋만 뽑는 자리가 여기 하나다.
 */
function pickTokens(authentication: {
  token: string;
  refreshToken?: string;
  expiresAt?: string;
}): UserTokens {
  return {
    accessToken: authentication.token,
    refreshToken: authentication.refreshToken ?? null,
    expiresAt: authentication.expiresAt === undefined ? null : new Date(authentication.expiresAt),
  };
}

/**
 * 인가 화면 URL. `state`는 nonce이고 목적지 slug는 쿠키의 서명 안에 있다 (ARCHITECTURE §6.4).
 *
 * ⚠️ **`redirectUrl`은 선택이 아니다** (malmoi#7). App에 callback URL이 여러 개 등록돼 있으면 GitHub은
 * 명시하지 않은 요청을 **첫 번째**로 보낸다 — 로컬에서 시작한 연결이 프로덕션으로 돌아가고, state
 * 쿠키가 그쪽에 없으니 영원히 `state-mismatch`다. 호출부가 요청 origin에서 만들어 넘긴다.
 */
export function authorizeUrl(state: string, redirectUrl: string): string {
  return createOAuthApp().getWebFlowAuthorizationUrl({ state, redirectUrl }).url;
}

/**
 * ⚠️ **`res.ok`로 판정하지 않는다.** GitHub 토큰 엔드포인트는 재사용·만료된 code에도 **HTTP 200**을
 * 주고 본문에 `error: "bad_verification_code"`를 담는다. 라이브러리가 그걸 던져 주므로 그대로 쓴다 —
 * 손으로 파싱하면 `undefined` 토큰을 성공으로 읽는다.
 */
export async function exchangeCode(code: string): Promise<UserTokens> {
  const { authentication } = await createOAuthApp().createToken({ code });
  return pickTokens(authentication);
}

/** refresh 토큰은 1회용이다 — 성공하면 이전 쌍이 무효이므로 호출부가 결과를 즉시 저장한다 (ARCHITECTURE §6.4). */
export async function refreshUserToken(refreshToken: string): Promise<UserTokens> {
  const { authentication } = await createOAuthApp().refreshToken({ refreshToken });
  return pickTokens(authentication);
}

export async function getViewer(accessToken: string): Promise<{ id: string; login: string }> {
  const res = await userOctokit(accessToken).request("GET /user");
  // `Account.providerAccountId`가 문자열이라 여기서 좁힌다 — 판정층은 숫자를 보지 않는다.
  return { id: String(res.data.id), login: res.data.login };
}

/**
 * ⚠️ **전 페이지를 읽는다.** 기본 30개씩 오는데 첫 페이지만 보면 31번째 설치·리포가
 * `installation-forbidden`·`repo-forbidden`으로 **거짓 거부**된다 — 이 목록은 표시용이 아니라
 * 인가 판정의 근거다 (ARCHITECTURE §6.4).
 */
export async function listUserInstallations(accessToken: string): Promise<string[]> {
  const items = await userOctokit(accessToken).paginate("GET /user/installations");
  return items.map((installation) => String(installation.id));
}

/** 그 설치에서 볼 수 있는 리포 하나. `pushedAt`은 같은 응답에 이미 있다 — **추가 호출이 0이다.** */
export type InstallationRepo = { fullName: string; pushedAt: string | null };

export async function listInstallationRepos(
  accessToken: string,
  installationId: string,
): Promise<InstallationRepo[]> {
  const items = await userOctokit(accessToken).paginate(
    "GET /user/installations/{installation_id}/repositories",
    { installation_id: Number(installationId) },
  );
  return items.map((repo) => ({ fullName: repo.full_name, pushedAt: repo.pushed_at ?? null }));
}
