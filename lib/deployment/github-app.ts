import { optionalEnv } from "@/lib/env";

type EnvSource = Record<string, string | undefined>;

/**
 * **GitHub App 구성 판정** (gitlab-repositories D4·D4a). 셀프 호스팅은 App 없이 GitLab만 쓰는 설치를 허용한다 — 다섯 변수는 **all-or-none**이다.
 *
 * - `complete` — 다섯 다 있다.
 * - `absent` — 다섯 다 없다. GitLab 전용 설치다.
 * - `partial` — 일부만 있다. **기동 거부**다(preflight가 이것으로 판정한다 — E-sh). 반쪽 구성으로 뜨면 연결은 되는데 커밋에서 죽는 길이 생긴다.
 *
 * ⚠️ **이 판정은 preflight 전용이다** — 소비자는 `partial` 하나뿐이다. 화면 갈래(GitHub 연결 카드·탭·설치 링크를 그릴지)는 이 판정이 아니라
 * `githubAppConfigured`(아래)가 가른다(D28 — 자격증명 넷만 본다).
 *
 * ⚠️ hosted(Vercel)는 항상 `complete`다 — 이 판정은 모드를 보지 않고 변수만 본다. 빈 문자열은 없는 것이다(`optionalEnv`와 같다).
 * ⚠️ `GITHUB_APP_SLUG`도 그룹에 든다 — hosted에서는 `optionalEnv`라 빠져도 기동하지만(설치 버튼이 사라질 뿐), 셀프 호스팅의 그룹 규칙은
 * 다섯을 한 묶음으로 본다(D4).
 */
export const GITHUB_APP_ENV = ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_CLIENT_ID", "GITHUB_APP_CLIENT_SECRET", "GITHUB_APP_SLUG"] as const;

export type GitHubAppConfig = "complete" | "absent" | "partial";

export function planGitHubAppConfig(source?: EnvSource): GitHubAppConfig {
  // 이름을 리터럴로 읽는다 — 셀프 호스팅 게이트(`self-hosted-gates.test.ts`)가 env 이름을 소스에서 센다. `source`가 없으면 `optionalEnv`가 프로세스 환경을 읽는다.
  const values = [
    optionalEnv("GITHUB_APP_ID", source),
    optionalEnv("GITHUB_APP_PRIVATE_KEY", source),
    optionalEnv("GITHUB_APP_CLIENT_ID", source),
    optionalEnv("GITHUB_APP_CLIENT_SECRET", source),
    optionalEnv("GITHUB_APP_SLUG", source),
  ];
  const present = values.filter((value) => value !== undefined).length;
  if (present === GITHUB_APP_ENV.length) return "complete";
  return present === 0 ? "absent" : "partial";
}

/**
 * 화면 갈래(D4a)의 입구 — **자격증명 넷**(ID·개인키·client id·secret)이 다 있으면 GitHub 연결 컨트롤을 그린다(D28). 슬러그는 설치 링크만 가른다 —
 * hosted에서 슬러그가 빠져도 연결·해제·쓰기는 되므로 카드·탭을 지우지 않고 설치 버튼만 사라진다(CLAUDE.md "조용히 사라진다").
 * ⚠️ preflight의 다섯 all-or-none 그룹 규칙(`planGitHubAppConfig`)과 다른 판정이다 — 그쪽은 셀프 호스팅 기동 거부다.
 * 함수 안에서 읽는다(모듈 최상위 평가 금지 — CLAUDE.md).
 */
export function githubAppConfigured(source?: EnvSource): boolean {
  return [
    optionalEnv("GITHUB_APP_ID", source),
    optionalEnv("GITHUB_APP_PRIVATE_KEY", source),
    optionalEnv("GITHUB_APP_CLIENT_ID", source),
    optionalEnv("GITHUB_APP_CLIENT_SECRET", source),
  ].every((value) => value !== undefined);
}
