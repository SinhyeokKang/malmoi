import { SKIP_MARKER } from "@/lib/pull/payload";
import { syncBranchFor } from "@/lib/pull/sync-branch";

/**
 * **GitLab CI 입력 변환** (gitlab-repositories D1, design §3). 생성 `.gitlab-ci.yml` job의 `variables`와 GitLab 예약 변수(`CI_*`)를
 * `push:local`의 인자로 옮긴다 — action v3(`.github/actions/malmoi-i18n-push/action.yml`)가 `with:`를 플래그로 옮기는 셸의 짝이다.
 * 셸에서 조립하지 않는 것이 요지다(POSTMORTEM 2026-08-31). 소비자는 `.gitlab/malmoi-i18n-push/run.ts` 하나다.
 *
 * ⚠️ **러너에서 `prisma generate` 없이 돈다** — `server-only`·Prisma에 닿는 import를 두지 않는다(`push-local-graph.test.ts`와 같은 이유).
 *
 * ⚠️ **스킵 판정은 세 겹째다** — 생성 job의 `rules`(첫 겹)와 `push.sh`의 마커 가드(둘째 겹)가 이미 거른다. 여기서 다시 보는 것은 손으로
 * 고친 `rules`가 MR·schedule 파이프라인이나 다른 브랜치에서 job을 돌려도 base가 아닌 커밋을 적재하지 않게 하려는 것이다.
 */

type Env = Readonly<Record<string, string | undefined>>;

export type GitlabCiPlan =
  | { kind: "skip"; reason: "not-push" | "other-branch" | "marker" }
  | { kind: "invalid"; message: string }
  | { kind: "run"; projectSlug: string; target: string; args: readonly string[] };

/** action v3 `api-url` 기본값과 같다. 셀프 호스팅 설치가 만든 job은 `MALMOI_I18N_API_URL`을 항상 든다(생성기 책임). */
const DEFAULT_API_URL = "https://mal-moi.com";

/** GitLab은 정의된 빈 변수를 `""`로 넘긴다 — action의 `default: ""`처럼 없는 것으로 읽는다. */
const value = (env: Env, name: string): string | undefined => {
  const v = env[name];
  return v === undefined || v === "" ? undefined : v;
};

export function planGitlabCiPush(env: Env): GitlabCiPlan {
  if (env.CI_PIPELINE_SOURCE !== "push") return { kind: "skip", reason: "not-push" };
  const baseBranch = value(env, "MALMOI_I18N_BASE_BRANCH");
  // ⚠️ **설정 누락은 스킵이 아니라 red다** — 스킵으로 접으면 CI가 영영 조용히 green이고 적재는 한 번도 안 일어난다.
  if (baseBranch === undefined) return { kind: "invalid", message: "MALMOI_I18N_BASE_BRANCH is not set — copy the job from Malmoi again." };
  if (env.CI_COMMIT_BRANCH !== baseBranch) return { kind: "skip", reason: "other-branch" };
  if ((env.CI_COMMIT_MESSAGE ?? "").includes(SKIP_MARKER)) return { kind: "skip", reason: "marker" };

  const projectSlug = value(env, "MALMOI_I18N_PROJECT");
  if (projectSlug === undefined) return { kind: "invalid", message: "MALMOI_I18N_PROJECT is not set — copy the job from Malmoi again." };
  const target = value(env, "MALMOI_I18N_TARGET") ?? value(env, "CI_PROJECT_DIR");
  if (target === undefined) return { kind: "invalid", message: "CI_PROJECT_DIR is not set — run this job on a GitLab runner, or set MALMOI_I18N_TARGET." };

  const args = [
    "--url", value(env, "MALMOI_I18N_API_URL") ?? DEFAULT_API_URL,
    "--project", projectSlug,
    "--surface", value(env, "MALMOI_I18N_SURFACE") ?? "default",
  ];
  const optional: readonly [string, string][] = [
    ["--path-template", "MALMOI_I18N_PATH_TEMPLATE"],
    ["--adapter", "MALMOI_I18N_ADAPTER"],
    ["--base", "MALMOI_I18N_BASE"],
  ];
  for (const [flag, name] of optional) {
    const v = value(env, name);
    if (v !== undefined) args.push(flag, v);
  }
  // action v3와 같다 — 줄바꿈으로 나뉜 스펙마다 공백을 지우고 플래그 하나.
  for (const line of (env.MALMOI_I18N_WRAPPER ?? "").split("\n")) {
    const spec = line.replace(/\s/g, "");
    if (spec !== "") args.push("--wrapper", spec);
  }
  return { kind: "run", projectSlug, target, args };
}

/**
 * 열린 Malmoi MR 조회 주소 — `CI_JOB_TOKEN`이 같은 프로젝트의 `GET /projects/:id/merge_requests`를 허용한다(GitLab 문서 "CI/CD job token"
 * 접근 표, 2026-10-12 확인). 만들 수 없으면 null이고 사전 경고를 건너뛴다 — **게이트의 정본은 서버의 `deferred`다.**
 */
export function openMergeRequestsUrl(env: Env, projectSlug: string): { url: string; syncBranch: string } | null {
  const api = value(env, "CI_API_V4_URL");
  const projectId = value(env, "CI_PROJECT_ID");
  if (api === undefined || projectId === undefined) return null;
  let branch: string;
  try {
    branch = syncBranchFor(projectSlug);
  } catch {
    return null;
  }
  return { url: `${api}/projects/${encodeURIComponent(projectId)}/merge_requests?state=opened&source_branch=${encodeURIComponent(branch)}`, syncBranch: branch };
}

export type OpenMergeRequestCheck = { kind: "open"; url: string | null } | { kind: "none" } | { kind: "failed" };

/**
 * 조회 응답 → 열림/없음/실패. ⚠️ **실패를 "없음"으로 읽지 않는다**(action v3의 `gh pr list`와 같은 교훈). ⚠️ **source·target 프로젝트가
 * 이 프로젝트인 MR만** Malmoi MR이다 — 같은 이름의 fork 브랜치에서 연 MR은 Malmoi가 만든 것이 아니다(design §3 공통 경계 `findOpenPr`).
 */
export function openMergeRequestCheck(status: number, text: string, projectId: string): OpenMergeRequestCheck {
  if (status < 200 || status >= 300) return { kind: "failed" };
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { kind: "failed" };
  }
  if (!Array.isArray(body)) return { kind: "failed" };
  const ours = body.find((mr: unknown) => {
    if (typeof mr !== "object" || mr === null) return false;
    const { source_project_id: source, target_project_id: target } = mr as Record<string, unknown>;
    return String(source) === projectId && String(target) === projectId;
  }) as Record<string, unknown> | undefined;
  if (ours === undefined) return { kind: "none" };
  // 로그 줄에 서버 문자열을 그대로 싣지 않는다 — http(s) URL 모양만.
  const url = typeof ours.web_url === "string" && /^https?:\/\/[^\s]+$/.test(ours.web_url) ? ours.web_url : null;
  return { kind: "open", url };
}

/** 사전 경고 한 줄. 서버가 적재를 보류한다고 말한다 — "덮는다"는 v2 문구는 서버 게이트(2026-09-30) 뒤로 거짓이다. */
export function openMergeRequestLine(check: OpenMergeRequestCheck, syncBranch: string): string {
  if (check.kind === "none") return `No open ${syncBranch} merge request (checked).`;
  if (check.kind === "failed") {
    return "WARNING: couldn't check whether a Malmoi merge request is open. The import continues; Malmoi itself defers it if one is open.";
  }
  return `WARNING: a Malmoi merge request is still open${check.url === null ? "" : ` (${check.url})`} — Malmoi won't import repository changes until it is merged or closed, so the translations in it aren't lost. After that, the next push or the nightly sync imports them.`;
}
