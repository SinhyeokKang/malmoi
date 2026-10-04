import "server-only";
import { z } from "zod";

import { listLinkedBranches, listNewRepoBranches } from "@/lib/onboarding-run/branches";
import { detectFormats, detectProjectFormats, DetectInput } from "@/lib/onboarding-run/detect";
import { listRepositories } from "@/lib/onboarding-run/repos";
import { isSyncBranchName } from "@/lib/pull/ref-slug";
import { routes } from "@/lib/routes";
import { en } from "@/messages/en";

import type { NeedsBrowserReason, ToolOutcome } from "../result";
import { checkCreateTool, checkProjectTool } from "./access";
import { appUrl, coreSubject, defineTool, ok, type ToolContext } from "./define";

/**
 * 리포 축 읽기 셋 (design §2.1 · §2.4). 두 GitHub 자격증명이 만나는 코어(`lib/onboarding-run`)를 부른다 — 사용자 확인은 user-to-server,
 * 리포 읽기는 installation 토큰. **입구 판정이 GitHub보다 먼저다** — 범위 밖·grant 없는 토큰이 GitHub을 부르지 않는다.
 *
 * ⚠️ **연결·재인가·설치는 브라우저가 한다** — state 쿠키가 방어선인 왕복이라 도구가 대신하지 않는다(ARCHITECTURE §6.4). URL은 전부
 * `/account` 하나이고(검수 Q) 서명·nonce를 싣지 않는다. 권한 거부·GitHub 장애·예산 초과는 브라우저 전환으로 숨기지 않는다.
 */

const BROWSER: Partial<Record<string, NeedsBrowserReason>> = { "not-connected": "not-connected", reauthorize: "reauthorize", "no-installations": "no-installations" };

function refusedOrBrowser(ctx: ToolContext, code: string): ToolOutcome {
  const reason = Object.hasOwn(BROWSER, code) ? BROWSER[code] : undefined;
  return reason === undefined ? { status: "refused", code } : { status: "needs-browser", reason, url: appUrl(ctx, routes.account()) };
}

export const listRepositoriesTool = defineTool({
  name: "list_repositories",
  inputSchema: z.object({}),
  async run(ctx) {
    const { prisma, subject } = ctx;
    const gate = checkCreateTool(subject, { name: "list_repositories" });
    if (gate.status !== "ok") return gate;
    const result = await listRepositories(prisma, coreSubject(subject));
    if (!result.ok) return refusedOrBrowser(ctx, result.error);
    return ok({ repositories: result.repos, installRequestPending: result.pending }, en.mcp.summary.repositories(result.repos.length));
  },
});

/**
 * 신규(`{ owner, repo }`)와 기존(`{ slug }`)의 두 입력 — **섞으면 입력 오류다**. 한쪽이 거부됐다고 다른 경로로 폴백하지 않는다: 기존
 * 프로젝트 탐지가 막힌 OWNER가 같은 리포를 신규 경로로 읽으면 grant 판정을 우회한다.
 */
const RepoOrSlug = z.object({
  owner: z.string().min(1).max(200).optional(),
  repo: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(200).optional(),
});
function variantOf(input: z.infer<typeof RepoOrSlug> & { ref?: string }): { kind: "new"; owner: string; repo: string } | { kind: "existing"; slug: string } | null {
  const repoForm = input.owner !== undefined || input.repo !== undefined || input.ref !== undefined;
  if (input.slug !== undefined) return repoForm ? null : { kind: "existing", slug: input.slug };
  return input.owner !== undefined && input.repo !== undefined ? { kind: "new", owner: input.owner, repo: input.repo } : null;
}

export const listBranches = defineTool({
  name: "list_branches",
  inputSchema: RepoOrSlug,
  async run(ctx, input) {
    const { prisma, subject } = ctx;
    const target = variantOf(input);
    if (target === null) return { status: "invalid-input" };
    let result;
    if (target.kind === "new") {
      const gate = checkCreateTool(subject, { name: "list_branches", variant: "newProject" });
      if (gate.status !== "ok") return gate;
      result = await listNewRepoBranches(prisma, coreSubject(subject), target);
    } else {
      // 기존 프로젝트의 브랜치 목록은 읽기 예외다(PRODUCT §3) — OWNER 역할만 보고 grant를 요구하지 않는다(검수 K).
      const gate = await checkProjectTool(prisma, subject, { name: "list_branches", variant: "existingProject", slug: target.slug });
      if (gate.status !== "ok") return gate;
      result = await listLinkedBranches(prisma, coreSubject(subject), target);
    }
    if (!result.ok) return refusedOrBrowser(ctx, result.error);
    // sync 브랜치는 기준 브랜치가 될 수 없다(malmoi#126) — 설정 화면의 목록과 같은 필터다.
    const names = result.names.filter(name => !isSyncBranchName(name));
    return ok({ branches: names, defaultBranch: result.defaultBranch, truncated: result.truncated }, en.mcp.summary.branches(names.length));
  },
});

export const detectFormatsTool = defineTool({
  name: "detect_formats",
  inputSchema: RepoOrSlug.extend({ ref: DetectInput.shape.ref }),
  async run(ctx, input) {
    const { prisma, subject } = ctx;
    const target = variantOf(input);
    if (target === null) return { status: "invalid-input" };
    let result;
    if (target.kind === "new") {
      const gate = checkCreateTool(subject, { name: "detect_formats", variant: "newProject" });
      if (gate.status !== "ok") return gate;
      result = await detectFormats(prisma, coreSubject(subject), { owner: target.owner, repo: target.repo, ref: input.ref });
    } else {
      // 기존 경로는 저장된 리포·base branch만 읽는다 — ref를 받지 않는다(위 `variantOf`가 섞인 입력을 거부했다).
      const gate = await checkProjectTool(prisma, subject, { name: "detect_formats", variant: "existingProject", slug: target.slug });
      if (gate.status !== "ok") return gate;
      result = await detectProjectFormats(prisma, coreSubject(subject), target);
    }
    if (!result.ok) {
      // 정상 조회 뒤 후보가 없을 때만 브라우저의 수동 설정으로 보낸다 — 장애·거부·예산 초과는 그대로 낸다.
      if (result.error === "no-candidates") {
        return { status: "needs-browser", reason: "no-candidates", url: appUrl(ctx, target.kind === "new" ? routes.newProject() : routes.sources(target.slug)) };
      }
      return refusedOrBrowser(ctx, result.error);
    }
    // 후보는 화면 문구를 싣지 않는다(ui-locales B1′) — 도구 응답의 계약인 영어 형식 이름을 여기서 붙인다(어댑터 이름은 화면 어휘가 아니다).
    const candidates = result.candidates.map(({ adapter, ...rest }) => ({ adapter, label: en.newProject.formats[adapter].label, ...rest }));
    return ok({ candidates }, en.mcp.summary.formats(candidates.length));
  },
});
