import "server-only";
import { z } from "zod";

import { logFailure } from "@/lib/github-connect/log";
import { m } from "@/lib/i18n";
import { rotateToken } from "@/lib/onboarding-run/rotate-token";
import { runArchive, runUnarchive } from "@/lib/projects/archive";
import { redrawIfArchived, revalidateAfterCommit, settleRevalidate } from "@/lib/revalidate-after-commit";
import { changeBaseBranch, renameProject } from "@/lib/settings/update";
import { BaseLocaleInput, declareBaseLocale } from "@/lib/sources/base-locale";
import { revalidatePath } from "next/cache";

import { checkProjectTool } from "./access";
import { coreSubject, defineTool, ok } from "./define";

/**
 * **설정 쓰기 다섯** (design §2.2). 코어는 Server Action과 같은 함수이고 재검증도 Action과 같은 경로를 **던지지 않는 형으로** 지운다
 * (POSTMORTEM 2026-09-20). 보관 거부는 그 세그먼트를 다시 그린다(`redrawIfArchived`) — 설정 화면을 연 사람의 컨트롤이 옛 상태로 남지 않게.
 */
const Slug = z.object({ slug: z.string().min(1).max(200) });

export const updateProject = defineTool({
  name: "update_project",
  inputSchema: Slug.extend({ name: z.string().max(1000).optional(), baseBranch: z.string().min(1).max(255).optional() }),
  async run({ prisma, subject }, { slug, name, baseBranch }) {
    if (name === undefined && baseBranch === undefined) return { status: "invalid-input" };
    const gate = await checkProjectTool(prisma, subject, { name: "update_project", slug });
    if (gate.status !== "ok") return gate;
    const changed: Record<string, string> = {};
    if (name !== undefined) {
      const renamed = await renameProject(prisma, coreSubject(subject), { slug, name });
      if (!renamed.ok) return redrawIfArchived(slug, renamed.error, { status: "refused", code: renamed.error });
      revalidateAfterCommit("name");
      changed.name = renamed.name;
    }
    if (baseBranch !== undefined) {
      let moved: Awaited<ReturnType<typeof changeBaseBranch>>;
      try {
        moved = await changeBaseBranch(prisma, coreSubject(subject), { slug, baseBranch });
      } catch (error) {
        // 브랜치만 요청했으면 지울 성공이 없다 — `executeTool`이 장애로 접는다.
        if (name === undefined) throw error;
        // ⚠️ **이름은 이미 커밋됐다 — 예외로 그 성공을 지우지 않는다**(Codex review CR-02 · POSTMORTEM 2026-09-20). 통신 예외는 브랜치가
        // 롤백됐다는 뜻이 아니므로 거부가 아니라 "확인 불가"다. 커밋됐을 수 있으니 두 화면을 다시 그린다.
        logFailure("mcp-tool-update_project", error);
        settleRevalidate("base-branch", () => revalidatePath(`/projects/${slug}/settings`));
        settleRevalidate("base-branch", () => revalidatePath(`/projects/${slug}`, "layout"));
        return ok({ changed, unconfirmed: ["baseBranch"] }, m.mcp.summary.branchUnconfirmed);
      }
      // 이름은 이미 커밋됐다 — 뒤의 거부로 앞의 성공을 지우지 않는다(불변식 9). 이름을 안 바꾼 호출이면 그대로 거부다.
      if (!moved.ok && name === undefined) return redrawIfArchived(slug, moved.error, { status: "refused", code: moved.error });
      if (!moved.ok) return redrawIfArchived(slug, moved.error, ok({ changed, failed: { baseBranch: moved.error } }, m.mcp.summary.nameOnly));
      settleRevalidate("base-branch", () => revalidatePath(`/projects/${slug}/settings`));
      settleRevalidate("base-branch", () => revalidatePath(`/projects/${slug}`, "layout"));
      changed.baseBranch = baseBranch;
    }
    return ok({ changed }, m.mcp.summary.updated);
  },
});

export const setBaseLocale = defineTool({
  name: "set_base_locale",
  inputSchema: BaseLocaleInput,
  async run({ prisma, subject }, input) {
    const gate = await checkProjectTool(prisma, subject, { name: "set_base_locale", slug: input.slug });
    if (gate.status !== "ok") return gate;
    const result = await declareBaseLocale(prisma, coreSubject(subject), input);
    if (!result.ok) return { status: "refused", code: result.error };
    revalidateAfterCommit("source-base-language", `/projects/${input.slug}`);
    return ok({ declaredBaseLocale: input.baseLocale }, m.mcp.summary.baseLocale(input.baseLocale));
  },
});

export const rotatePushToken = defineTool({
  name: "rotate_push_token",
  inputSchema: Slug,
  async run({ prisma, subject }, { slug }) {
    const gate = await checkProjectTool(prisma, subject, { name: "rotate_push_token", slug });
    if (gate.status !== "ok") return gate;
    const result = await rotateToken(prisma, coreSubject(subject), { slug });
    if (!result.ok) return redrawIfArchived(slug, result.error, { status: "refused", code: result.error });
    settleRevalidate("rotate-token", () => revalidatePath(`/projects/${slug}/settings`));
    /**
     * ⚠️ **원문이 도구 결과로 나간다** (2026-09-28 사용자 확정) — 프로젝트 한정·`/api/push` 한 곳의 쓰기·재발급이 곧 폐기다. 안내는 원문을
     * `gh secret set PUSH_TOKEN`의 **표준입력**으로 넘기게 한다(`--body` 생략 — `--body -`는 문자 `-`를 저장한다). 생성 YAML의 secret 이름과 같다.
     */
    return ok({ pushToken: result.pushToken, secretName: "PUSH_TOKEN" }, m.mcp.summary.pushToken);
  },
});

export const archiveProject = defineTool({
  name: "archive_project",
  inputSchema: Slug,
  async run({ prisma, subject }, { slug }) {
    const gate = await checkProjectTool(prisma, subject, { name: "archive_project", slug });
    if (gate.status !== "ok") return gate;
    const result = await runArchive(prisma, coreSubject(subject), { slug });
    if (!result.ok) return { status: "refused", code: result.error };
    // 보관은 목록·사이드바·Home·번역·설정을 다 바꾼다 — Action과 같은 루트 레이아웃 무효화다.
    settleRevalidate("archive", () => revalidatePath("/", "layout"));
    return ok({ archived: true }, m.mcp.summary.archived);
  },
});

export const unarchiveProject = defineTool({
  name: "unarchive_project",
  inputSchema: Slug,
  async run({ prisma, subject }, { slug }) {
    const gate = await checkProjectTool(prisma, subject, { name: "unarchive_project", slug });
    if (gate.status !== "ok") return gate;
    const result = await runUnarchive(prisma, coreSubject(subject), { slug });
    if (!result.ok) return { status: "refused", code: result.error };
    settleRevalidate("unarchive", () => revalidatePath("/", "layout"));
    return ok({ archived: false }, m.mcp.summary.restored);
  },
});
