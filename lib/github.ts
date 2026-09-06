// ⚠️ **`server-only`를 일부러 붙이지 않았다.** 붙이면 `scripts/smoke-github.ts`가 이 모듈을
// **열 수조차 없어** 스모크가 프로덕션 코드 경로가 아닌 사본을 검증하게 된다 — `lib/env.ts`·
// `lib/push/apply.ts`가 같은 이유로 붙이지 않은 선례다 (ARCHITECTURE §5.5.4).
// 클라이언트 유입 위험은 낮다: 이 파일이 무는 것은 타입과 `lib/env.ts`, `octokit`뿐이고
// `"use client"` 그래프에 들어가면 octokit 때문에 번들이 터져 즉시 드러난다.
import { App } from "octokit";

import { parsePrivateKey, requireEnv } from "@/lib/env";
import { httpStatus, probeFromError, type ProbeResult } from "@/lib/github-connect/health";
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
 * ⚠️ **try가 클라이언트 생성까지 감싼다.** 설치가 삭제되면 `GET /repos`가 아니라
 * `getInstallationOctokit`의 토큰 발급이 404로 죽는다 — 밖에 두면 그 경로가 처리되지 않은 예외가 된다.
 *
 * ⚠️ **예외를 삼켜 `not-installed`로 접지 않는다.** 분류는 `probeFromError`가 하고 그 함수가 5xx·네트워크를
 * `error`로 남긴다 — 장애를 "제거됨"으로 읽으면 사용자가 멀쩡한 설치를 다시 만든다
 * (POSTMORTEM 2026-09-03). **여기서 직접 상태 코드를 분기하면 판정이 두 벌이 된다.**
 */
export async function probeRepo(owner: string, repo: string): Promise<ProbeResult> {
  try {
    const app = createApp();
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
    };
  } catch (error) {
    return probeFromError(httpStatus(error)) === "not-installed"
      ? { status: "not-installed" }
      : { status: "error" };
  }
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
