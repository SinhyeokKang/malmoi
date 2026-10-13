/**
 * GitLab CI의 TS 층 — `push.sh`가 설치 뒤 부른다. 입력 변환·MR 판정은 순수 함수(`lib/cli/gitlab-ci-input.ts`)이고 여기는 네트워크·프로세스만 안다.
 *
 * ⚠️ **러너에는 `prisma generate`가 없다** — 값 import는 node 내장과 그 순수 모듈뿐이다(`scripts/__tests__/gitlab-ci-template.test.ts`가 센다).
 */
import { spawnSync } from "node:child_process";

import { openMergeRequestCheck, openMergeRequestLine, openMergeRequestsUrl, planGitlabCiPush } from "../../lib/cli/gitlab-ci-input";

const plan = planGitlabCiPush(process.env);
if (plan.kind === "skip") {
  console.log(`Malmoi import skipped (${plan.reason}).`);
  process.exit(0);
}
if (plan.kind === "invalid") {
  console.error(plan.message);
  process.exit(2);
}

// 열린 Malmoi MR 사전 안내 — action v3의 "열린 번역 PR 경고"에 해당한다. **게이트의 정본은 서버**(`deferred` `open-pr`)이고 이 줄은 push 전에
// 알리는 것뿐이라, 조회 실패도 red가 아니다.
const query = openMergeRequestsUrl(process.env, plan.projectSlug);
const jobToken = process.env.CI_JOB_TOKEN;
if (query !== null && jobToken !== undefined && jobToken !== "") {
  let check: ReturnType<typeof openMergeRequestCheck>;
  try {
    const res = await fetch(query.url, { headers: { "JOB-TOKEN": jobToken }, signal: AbortSignal.timeout(5000) });
    check = openMergeRequestCheck(res.status, await res.text(), process.env.CI_PROJECT_ID ?? "");
  } catch {
    check = { kind: "failed" };
  }
  console.log(openMergeRequestLine(check, query.syncBranch));
}

const result = spawnSync("pnpm", ["push:local", plan.target, ...plan.args], { stdio: "inherit", env: process.env });
process.exit(result.status ?? 1);
