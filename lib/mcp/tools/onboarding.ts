import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { en } from "@/messages/en";
import { addSources, AddSurfacesInput } from "@/lib/onboarding-run/add";
import { CreateProjectInput, createProjectFromRepo } from "@/lib/onboarding-run/create";
import { settleRevalidate } from "@/lib/revalidate-after-commit";

import type { ToolOutcome } from "../result";
import { checkCreateTool, checkProjectTool } from "./access";
import { ciFileOf, gitlabCiReleased, GITHUB_WORKFLOW_PATH } from "./ci-file";
import { coreSubject, defineTool, ok } from "./define";
import { NewRepoFields, newRepoOf } from "./repos";

/**
 * **생성·소스 추가** (design §2.2). 둘 다 `detect_formats`가 준 **샘플 확인값을 필수로** 받는다 — 코어가 인가 뒤 읽은 같은 스냅샷 head로 전부
 * 대조하고, 하나라도 실패하면 Project·Surface·번역·사건·`projectIds`에 쓰기 0건이다. 확인값 누락은 입력 오류, 만료·변조·대상 불일치는
 * `sample-expired`, 포맷 불일치는 `manual-no-match`다 — `detect_formats`를 다시 불러 새 확인값을 받는다(자동 재탐지로 쓰기를 잇지 않는다).
 * 웹 Action은 확인값을 받지 않는 기존 계약 그대로다.
 */
const Confirmation = z.string().min(1).max(65_536);

function failure(result: { error: string; index?: number; surface?: unknown; conflicts?: unknown }): ToolOutcome {
  const detail = { ...(result.index === undefined ? {} : { index: result.index }), ...(result.surface ? { surface: result.surface } : {}), ...(result.conflicts ? { conflicts: result.conflicts } : {}) };
  // 코어의 입력 오류 낱말(`invalid input`)은 도구 어휘(`invalid-input`)로 옮긴다 — 같은 갈래다. 후보 순번은 그대로 싣는다.
  return { status: "refused", code: result.error === "invalid input" ? "invalid-input" : result.error, detail };
}

const PickWithConfirmation = CreateProjectInput.shape.surfaces.element.extend({ confirmation: Confirmation });

export const createProject = defineTool({
  name: "create_project",
  // 수동 확정(`manual`)은 도구에 없다 — 후보가 없으면 브라우저의 수동 설정이 길이다(`detect_formats`의 needs-browser).
  // 리포는 GitHub `{ owner, repo }` 또는 GitLab `{ host: "gitlab", repositoryId }` — 섞으면 입력 오류다(`newRepoOf`).
  inputSchema: CreateProjectInput.omit({ manual: true, owner: true, repo: true }).extend({ ...NewRepoFields, surfaces: z.array(PickWithConfirmation).min(1) }),
  async run({ prisma, subject, origin }, input) {
    const gate = checkCreateTool(subject, { name: "create_project" });
    if (gate.status !== "ok") return gate;
    const { surfaces, owner, repo, host, repositoryId, ...rest } = input;
    const target = newRepoOf({ owner, repo, host, repositoryId });
    if (target === null) return { status: "invalid-input" };
    const result = await createProjectFromRepo(prisma, coreSubject(subject), {
      ...target, ...rest, surfaces: surfaces.map(({ confirmation: _c, ...surface }) => surface),
    }, { confirmations: surfaces.map(surface => surface.confirmation), origin });
    if (!result.ok) return failure(result);
    settleRevalidate("create-project", () => revalidatePath("/projects"));
    settleRevalidate("create-project", () => revalidatePath("/projects/new"));
    if ("host" in target) {
      /**
       * GitLab — 코어는 GitHub 워크플로만 만든다(`yaml: ""`). CI 파일은 만든 표면으로 여기서 렌더한다(쓰기 뒤 DB를 다시 읽지 않는다 — 그
       * 조회가 실패하면 한 번뿐인 push 토큰 원문이 장애로 접혀 사라진다). 릴리스 SHA 전이면 `null`이고 요약이 그동안의 길(Sync)을 말한다.
       * push 토큰은 대상 프로젝트의 CI/CD 변수 `PUSH_TOKEN`(Protected·Masked)으로 넣는다 — 리포 파일(`variables:`)에 적지 않는다.
       */
      const workflow = ciFileOf("gitlab", { slug: result.slug, baseBranch: result.baseBranch, surfaces: result.surfaces, origin });
      return ok({
        slug: result.slug, defaultSourceSlug: result.defaultSurfaceSlug, baseBranch: result.baseBranch, sources: result.surfaces, keys: result.count,
        pushToken: result.pushToken, variableName: "PUSH_TOKEN", workflow,
      }, workflow === null ? en.mcp.summary.gitlab.createdWithoutCi(result.slug, result.count) : en.mcp.summary.gitlab.created(result.slug, result.count));
    }
    /**
     * ⚠️ push 토큰 원문이 여기 한 번 나간다 — `rotate_push_token`과 같은 판단(프로젝트 한정·`/api/push` 한 곳·재발급이 곧 폐기). 대상 리포의
     * `PUSH_TOKEN` secret으로 **표준입력**을 통해 넣는다(`gh secret set PUSH_TOKEN --repo OWNER/REPO`, `--body` 생략).
     */
    return ok({
      slug: result.slug, defaultSourceSlug: result.defaultSurfaceSlug, baseBranch: result.baseBranch, sources: result.surfaces, keys: result.count,
      pushToken: result.pushToken, secretName: "PUSH_TOKEN", workflow: { path: GITHUB_WORKFLOW_PATH, yaml: result.yaml },
    }, en.mcp.summary.created(result.slug, result.count));
  },
});

export const addSourcesTool = defineTool({
  name: "add_sources",
  inputSchema: AddSurfacesInput.extend({ picks: z.array(AddSurfacesInput.shape.picks.element.extend({ confirmation: Confirmation })).min(1).max(200) }),
  async run({ prisma, subject, origin }, input) {
    const gate = await checkProjectTool(prisma, subject, { name: "add_sources", slug: input.slug });
    if (gate.status !== "ok") return gate;
    const host = gate.repoHost;
    const result = await addSources(prisma, coreSubject(subject), {
      slug: input.slug, picks: input.picks.map(({ confirmation: _c, ...pick }) => pick),
    }, { confirmations: input.picks.map(pick => pick.confirmation), origin });
    if (!result.ok) return failure(result);
    settleRevalidate("add-sources", () => revalidatePath(`/projects/${input.slug}`, "layout"));
    settleRevalidate("add-sources", () => revalidatePath("/projects"));
    /**
     * GitLab은 표면이 늘면 job 파일 전체를 다시 붙인다(docs/ACTIONS.md §5) — 코어의 `yaml`은 GitHub step이라 싣지 않는다. 파일은 `get_workflow`가
     * 준다: 쓰기 뒤 표면을 다시 읽는 조회가 여기서 실패하면 추가된 소스까지 장애로 접힌다.
     */
    if (host === "gitlab") {
      const n = result.results.length;
      return ok({ sources: result.results }, gitlabCiReleased() ? en.mcp.summary.gitlab.sourcesAdded(n) : en.mcp.summary.gitlab.sourcesAddedWithoutCi(n));
    }
    return ok({ sources: result.results, workflowSteps: result.yaml }, en.mcp.summary.sourcesAdded(result.results.length));
  },
});
