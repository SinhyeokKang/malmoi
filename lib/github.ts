// ⚠️ **`server-only`를 일부러 붙이지 않았다.** 붙이면 `scripts/smoke-github.ts`가 이 모듈을
// **열 수조차 없어** 스모크가 프로덕션 코드 경로가 아닌 사본을 검증하게 된다 — `lib/env.ts`·
// `lib/push/apply.ts`가 같은 이유로 붙이지 않은 선례다 (ARCHITECTURE §5.5.4).
// 클라이언트 유입 위험은 낮다: 이 파일이 무는 것은 타입과 `lib/env.ts`, `octokit`뿐이고
// `"use client"` 그래프에 들어가면 octokit 때문에 번들이 터져 즉시 드러난다.
import { App } from "octokit";

import { parsePrivateKey, requireEnv } from "@/lib/env";
import { httpStatus, probeFromError, type ProbeResult } from "@/lib/github-connect/health";
import { logFailure } from "@/lib/github-connect/log";
import type { GitClient, GitTreeBlob } from "@/lib/pull/client";
import type { CommitPayload, TreePayload } from "@/lib/pull/payload";

/**
 * GitHub App installation 토큰으로 Git Data API를 부르는 얇은 껍데기.
 *
 * **판정은 전혀 하지 않는다** — 무엇을 낼지는 `lib/pull/plan.ts`·`payload.ts`가 정하고 여기는
 * 보내기만 한다. 그래서 이 파일에 단위 테스트가 없고(fetch 모킹 비용 > 가치), 검증은
 * `scripts/smoke-github.ts`의 실 호출과 오케스트레이션의 fake 테스트가 나눠 맡는다.
 *
 * ⚠️ **사용자 OAuth 토큰이 이 경로에 들어오면 안 된다.** 커밋이 개인 명의가 되고 그 사람이
 * org를 떠나면 파이프라인이 깨진다 (ARCHITECTURE §6).
 */

/**
 * ⚠️ **지연 생성.** 모듈 최상위나 기본값 인자에서 환경변수를 읽지 않는다 — 그러면 "파일을 읽기만
 * 해도 죽는다"가 되고, `.env`가 없는 CI에서 import·빌드만으로 실패한다.
 * POSTMORTEM 2026-08-31에 **재발까지** 기록된 함정이다 (`f(x, requireEnv(...))`도 같은 부류).
 */
function createApp(): App {
  return new App({
    appId: requireEnv("GITHUB_APP_ID"),
    // PEM 개행 복원. Vercel env는 개행을 `\n` 두 문자로 이스케이프하고, 그대로 서명에 쓰면
    // JWT가 **조용히** 실패한다 — 에러 메시지가 원인을 가리키지 않는다.
    privateKey: parsePrivateKey(requireEnv("GITHUB_APP_PRIVATE_KEY")),
  });
}

/** `null`을 주는 GitHub 404. 그 외 상태 코드는 그대로 던진다. */
export function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && error.status === 404;
}

/**
 * 연결 건강성의 근거를 읽는다 (design §3.3). **판정은 `planConnectionHealth`가 한다** — 여기서
 * 돌려주는 것은 "우리 App이 이 리포에 설치돼 있는가"와 "지금 이름이 무엇인가"뿐이다.
 *
 * ⚠️ **`GET /repos/{o}/{r}`만으로는 판정할 수 없다.** installation 토큰으로도 **public 리포는 접근을
 * 철회한 뒤에 200을 주므로** 그것만 보면 `ok`로 오판한다. App JWT의 `/installation`이 "설치돼 있는가"를
 * 결정적으로 답하고, 두 번째 호출은 **이름 감지 전용**이다(리네임이면 octokit이 301을 따라가 새
 * `full_name`을 준다).
 *
 * ⚠️ **try가 토큰 발급까지 감싼다.** 설치가 삭제되면 `GET /repos`가 아니라
 * `getInstallationOctokit`의 토큰 발급이 404로 죽는다 — 밖에 두면 그 경로가 처리되지 않은 예외가 된다.
 *
 * ⚠️ **`createApp()`은 try 밖이다.** 환경변수 누락(`MissingEnvError`)은 GitHub 실패가 아니라 우리 설정
 * 오류고, 값으로 접으면 화면이 "확인할 수 없어요 — 잠시 뒤 다시"를 **영원히** 보인다 — 2026-09-06 개인키
 * 사고가 그 화면이었다(POSTMORTEM). 사용자가 할 수 있는 일이 없는 오류는 500이 정직하다
 * (`state.ts`의 `requireSecret`과 같은 판단). 호출부(설정 화면·재연결 Action)도 이것을 잡지 않는다.
 *
 * ⚠️ **예외를 삼켜 `not-installed`로 접지 않는다.** 분류는 `probeFromError`가 하고 그 함수가 5xx·네트워크를
 * `error`로 남긴다 — 장애를 "제거됨"으로 읽으면 사용자가 멀쩡한 설치를 다시 만든다
 * (POSTMORTEM 2026-09-03). **여기서 직접 상태 코드를 분기하면 판정이 두 벌이 된다.** `error`로 접는
 * 쪽은 로그를 남긴다 — 화면에는 갈래 이름만 가고 원인은 여기서만 볼 수 있다.
 */
export async function probeRepo(owner: string, repo: string): Promise<ProbeResult> {
  const app = createApp();
  try {
    const installation = await app.octokit.request("GET /repos/{owner}/{repo}/installation", {
      owner,
      repo,
    });
    const octokit = await app.getInstallationOctokit(installation.data.id);
    const res = await octokit.request("GET /repos/{owner}/{repo}", { owner, repo });
    return {
      status: "ok",
      // `Project.installationId`가 문자열이라 여기서 좁힌다 (`createGitClient`의 `Number()`와 대칭).
      installationId: String(installation.data.id),
      fullName: res.data.full_name,
      // 같은 응답에 이미 있다 — 온보딩이 `Project.baseBranch`를 이 값으로 채운다 (design §4).
      defaultBranch: res.data.default_branch,
    };
  } catch (error) {
    if (probeFromError(httpStatus(error)) === "not-installed") return { status: "not-installed" };
    logFailure("probe", error);
    return { status: "error" };
  }
}

/**
 * 리포를 여러 번 읽는 동안 **설치 토큰을 한 번만 발급**하는 리더. 온보딩의 탐지·첫 적재가 이것을 쓴다.
 *
 * ⚠️ **읽기마다 새로 열지 않는다** — 토큰 캐시가 App 인스턴스에 붙어 있어 매번 열면 호출이 2배다
 * (code-review 2026-09-07 🔴2).
 *
 * `blob`은 못 읽으면 `undefined`다. 후보를 떨어뜨리는 대신 "키 수 확인 실패"로 표시하는 것이 호출부의
 * 규칙이라(ARCHITECTURE §4의 연장) 여기서 던지지 않는다 — 대신 실패는 **로그에 남는다**.
 */
export type RepoReader = {
  snapshot(baseBranch: string): Promise<RepoSnapshot>;
  /** 트리 항목의 `sha`로 읽는다 — contents API의 1MB 상한이 없다. */
  blob(sha: string): Promise<string | undefined>;
};

/**
 * 온보딩이 보는 리포 스냅샷 (design §3.10). **잘림·브랜치 부재·장애를 값으로 준다** — 온보딩은 그것을
 * "파일이 너무 많아 자동 탐지를 할 수 없어요"처럼 **말해야** 하고, pull은 같은 상황에서 **던져야** 한다
 * (부분 트리로 blob SHA를 비교하면 전부 틀어진다). 그래서 판정이 아니라 값이고, `GitClient.getTree`가
 * 이 위에서 던진다 — `lib/pull/client.ts`의 계약은 그대로다.
 */
export type RepoSnapshot =
  | { status: "ok"; headSha: string; headCommittedAt: string; files: GitTreeBlob[] }
  | { status: "truncated" }
  | { status: "base-branch-missing" }
  | { status: "unavailable" };

/**
 * base 브랜치 head의 트리 전체.
 *
 * ⚠️ **`headCommittedAt`을 위해 `GET /git/commits/{sha}`를 한 번 더 부른다.** ref·tree 응답에 커밋 시각이
 * 없고, 첫 적재가 `new Date()`를 쓰면 그 시각이 커밋보다 미래라 **CI의 첫 push가 `stale-commit` 409로
 * 거부된다** (`checkCommitOrder`는 동일 시각만 통과시킨다 — design §4).
 *
 * ⚠️ **ref가 404여도 "브랜치 없음"으로 단정하지 않는다** — GitHub은 권한 없는 리소스에도 404를 준다
 * (`client.ts` 주석, POSTMORTEM 2026-09-03). 호출부가 `probeRepo`로 설치를 먼저 확인한 뒤에만 이 값을
 * "브랜치가 없다"로 읽는다.
 *
 * ⚠️ **`createApp()`은 try 밖이다** — 환경변수 누락은 값으로 접지 않고 던진다. 값으로 접으면 설정 오류가
 * 화면에서 영원히 "잠시 뒤 다시"가 된다 (`probeRepo`와 같은 판단, POSTMORTEM 2026-09-06).
 */
export async function openRepoReader(
  owner: string,
  repo: string,
  installationId: string,
): Promise<RepoReader> {
  // ⚠️ **App을 한 번만 만든다.** `@octokit/auth-app`의 설치 토큰 캐시는 인스턴스마다 새로 생기므로,
  // 읽기마다 `createApp()`을 부르면 **매 호출에 `POST /app/installations/{id}/access_tokens`가 하나씩
  // 더 붙는다** — design §3.1의 예산(`ref 1 + tree 1 + blob ≤21`)이 2배가 되고, 50로케일 리포의 첫
  // 적재는 100회가 되어 `maxDuration=60`에서 잘린다 (code-review 2026-09-07 🔴2). `createGitClient`가
  // 클로저를 돌려주는 것과 같은 이유다.
  const app = createApp();
  const octokit = await app.getInstallationOctokit(Number(installationId));
  const base = { owner, repo };

  return {
    async snapshot(baseBranch: string): Promise<RepoSnapshot> {
      try {
        let headSha: string;
        try {
          const ref = await octokit.request("GET /repos/{owner}/{repo}/git/ref/{ref}", {
            ...base,
            // 인코딩하지 않는다 — octokit이 담당한다 (`createGitClient.getRefSha`와 같은 함정).
            ref: `heads/${baseBranch}`,
          });
          headSha = ref.data.object.sha;
        } catch (error) {
          if (isNotFound(error)) return { status: "base-branch-missing" };
          throw error;
        }

        const commit = await octokit.request("GET /repos/{owner}/{repo}/git/commits/{commit_sha}", {
          ...base,
          commit_sha: headSha,
        });

        const tree = await octokit.request("GET /repos/{owner}/{repo}/git/trees/{tree_sha}", {
          ...base,
          tree_sha: headSha,
          recursive: "1",
        });
        // 잘린 트리로 탐지하면 "그 리포에 로케일 파일이 없다"고 잘못 말한다 — 값으로 알리고 화면이 수동 지정을 권한다.
        if (tree.data.truncated) return { status: "truncated" };

        // ⚠️ **`sha`를 함께 든다.** 경로만 들면 blob을 contents API로 읽어야 하고 그쪽은 **1MB에서
        // 잘려 `encoding: "none"`을 준다** — 큰 카탈로그 하나가 조용히 사라진다 (code-review 🟡2).
        // git blobs API는 100MB까지이고 sha는 이 응답에 이미 있다(비용 0).
        const files: GitTreeBlob[] = [];
        for (const entry of tree.data.tree) {
          if (entry.type !== "blob") continue;
          if (entry.path === undefined || entry.sha === undefined) continue;
          files.push({ path: entry.path, sha: entry.sha });
        }
        return { status: "ok", headSha, headCommittedAt: commit.data.committer.date, files };
      } catch (error) {
        // 장애를 거부로 접지 않는다 — 화면이 "잠시 뒤 다시"를 말할 수 있는 유일한 갈래다.
        logFailure("snapshot", error);
        return { status: "unavailable" };
      }
    },

    async blob(sha: string): Promise<string | undefined> {
      try {
        const res = await octokit.request("GET /repos/{owner}/{repo}/git/blobs/{file_sha}", {
          ...base,
          file_sha: sha,
        });
        if (res.data.encoding !== "base64") return undefined;
        // 한글·프랑스어가 들어가므로 UTF-8로 디코딩해야 한다 (`getBlobText`와 같은 이유).
        return Buffer.from(res.data.content, "base64").toString("utf8");
      } catch (error) {
        logFailure("blob", error);
        return undefined;
      }
    },
  };
}

/**
 * 대상 리포에 쓸 수 있는 클라이언트를 만든다.
 *
 * @param installationId `Project.installationId`. App 자체는 앱 단위 환경변수이고 설치는
 *   고객별이라 컬럼에서 온다 — 그래서 인자다.
 */
export async function createGitClient(
  owner: string,
  repo: string,
  installationId: string,
): Promise<GitClient> {
  const app = createApp();
  const octokit = await app.getInstallationOctokit(Number(installationId));
  const base = { owner, repo };

  return {
    async getRefSha(ref) {
      try {
        // ⚠️ **슬래시를 직접 인코딩하지 않는다.** octokit이 `{ref}`를 URL에 넣을 때 이미
        // `heads/dev` → `heads%2Fdev`로 바꾼다. 먼저 인코딩하면 `%252F`가 되어 **조용한 404**다
        // (실측: `heads%2Fdev`를 넘기면 404). ARCHITECTURE §3의 인코딩 함정은 raw fetch 기준이다.
        const res = await octokit.request("GET /repos/{owner}/{repo}/git/ref/{ref}", {
          ...base,
          ref,
        });
        return res.data.object.sha;
      } catch (error) {
        // 브랜치 부재는 정상 입력이다 — `l10n/sync`가 없으면 첫 실행 경로를 탄다.
        if (isNotFound(error)) return null;
        throw error;
      }
    },

    async getTree(commitSha) {
      const res = await octokit.request("GET /repos/{owner}/{repo}/git/trees/{tree_sha}", {
        ...base,
        tree_sha: commitSha,
        recursive: "1",
      });
      // 잘린 트리를 그대로 쓰면 base에 있는 파일을 "없다"고 판정해 신규로 올리고,
      // blob SHA 비교 전체가 틀어진다. 조용히 진행하는 것이 최악이다.
      if (res.data.truncated) {
        throw new Error(`트리가 잘렸다 (${commitSha}) — 파일이 너무 많아 비교를 신뢰할 수 없다`);
      }
      const blobs: GitTreeBlob[] = [];
      for (const entry of res.data.tree) {
        // 디렉터리·심링크·서브모듈은 호출부가 쓰지 않는다.
        if (entry.type !== "blob") continue;
        if (entry.path === undefined || entry.sha === undefined) continue;
        blobs.push({ path: entry.path, sha: entry.sha });
      }
      return blobs;
    },

    async getBlobText(sha) {
      const res = await octokit.request("GET /repos/{owner}/{repo}/git/blobs/{file_sha}", {
        ...base,
        file_sha: sha,
      });
      // Git blob API는 base64로 준다. 한글·프랑스어가 들어가므로 UTF-8로 디코딩해야 한다.
      if (res.data.encoding !== "base64") {
        throw new Error(`예상하지 않은 blob 인코딩: ${res.data.encoding}`);
      }
      return Buffer.from(res.data.content, "base64").toString("utf8");
    },

    async createTree(payload: TreePayload) {
      const res = await octokit.request("POST /repos/{owner}/{repo}/git/trees", {
        ...base,
        ...payload,
      });
      return res.data.sha;
    },

    async createCommit(payload: CommitPayload) {
      const res = await octokit.request("POST /repos/{owner}/{repo}/git/commits", {
        ...base,
        ...payload,
      });
      return res.data.sha;
    },

    async createRef(branch, sha) {
      // 생성은 `refs/heads/...` **전체 경로**를 본문에 담는다. 여기선 인코딩하지 않는다 —
      // URL 파라미터가 아니라 JSON 값이다.
      await octokit.request("POST /repos/{owner}/{repo}/git/refs", {
        ...base,
        ref: `refs/heads/${branch}`,
        sha,
      });
    },

    async updateRefForce(branch, sha) {
      await octokit.request("PATCH /repos/{owner}/{repo}/git/refs/{ref}", {
        ...base,
        // 인코딩하지 않는다 — octokit이 담당한다 (위 getRefSha 주석).
        ref: `heads/${branch}`,
        sha,
        // 스냅샷 브랜치이므로 force가 의도된 것이다 (ARCHITECTURE §3).
        force: true,
      });
    },

    async findOpenPrUrl(head, baseBranch) {
      const res = await octokit.request("GET /repos/{owner}/{repo}/pulls", {
        ...base,
        // `owner:branch` 형식이어야 필터가 걸린다. 브랜치명만 넘기면 GitHub이 필터를 조용히
        // 무시해 전체 목록이 오고, 재사용 판정이 무너져 PR이 중복 생성된다.
        head,
        base: baseBranch,
        state: "open",
      });
      return res.data[0]?.html_url ?? null;
    },

    async createPr(headBranch, baseBranch, title, body) {
      const res = await octokit.request("POST /repos/{owner}/{repo}/pulls", {
        ...base,
        head: headBranch,
        base: baseBranch,
        title,
        body,
      });
      return res.data.html_url;
    },
  };
}
