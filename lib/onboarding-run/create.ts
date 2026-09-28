import "server-only";
import { randomUUID } from "node:crypto";

import { z } from "zod";

import { adapterFor, isAdapterName } from "@/lib/adapters";
import type { AdapterError, AdapterName } from "@/lib/adapters/types";
import { lockApiToken } from "@/lib/auth/lock";
import type { Subject } from "@/lib/auth/subject";
import type { PrismaClient } from "@/generated/prisma/client";
import { runTokenFor } from "@/lib/events/payload";
import { recordEvent, recordRun } from "@/lib/events/record";
import { requireEnv } from "@/lib/env";
import { isUniqueViolation } from "@/lib/failure";
import { openRepoReader } from "@/lib/github";
import { logFailure } from "@/lib/github-connect/log";
import { readFiles, snapshotError } from "@/lib/import/read";
import { IngestBudgetError } from "@/lib/onboarding/budget";
import { planConfirmedFormat, templatePaths } from "@/lib/onboarding/confirm";
import { PROJECT_LIMIT, planProjectCreate } from "@/lib/onboarding/create-plan";
import { ingestTargets } from "@/lib/onboarding/detect";
import { prepareFirstSnapshot } from "@/lib/onboarding/ingest";
import { planSlug } from "@/lib/onboarding/slug";
import { renderProjectWorkflowYaml } from "@/lib/onboarding/workflow";
import { PROJECT_NAME_MAX_CHARS } from "@/lib/projects/plan";
import { isValidBranchName } from "@/lib/pull/branch-name";
import { resolveLocalePaths } from "@/lib/pull/plan";
import { isSyncBranchName } from "@/lib/pull/ref-slug";
import { applyPushInTransaction } from "@/lib/push/apply";
import { generatePushToken, hashPushToken } from "@/lib/push/token";
import { planSurfaceSlug, selectDefaultSurface, surfaceOwnership } from "@/lib/surfaces/plan";

import { planSampleConfirmations } from "@/lib/mcp/confirm";

import { checkRepoAccess, type OnboardFailure } from "./access";
import { ownedActiveProjects } from "./repos";

export const CreateProjectInput = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  manual: z.boolean().optional(),
  surfaces: z.array(z.object({ adapter: z.string().min(1), pathTemplate: z.string().min(1), baseLocale: z.string().min(1) })).min(1),
  slug: z.string().min(1),
  // T8 이후에는 UI가 선택한 브랜치를 반드시 보낸다. 탐지와 다른 기본값으로 저장하지 않는다.
  baseBranch: z.string().min(1),
  // ⚠️ 상한이 있는 이유는 **저장되는 유일한 자유 입력**이기 때문이다 — slug는 `planSlug`가 40자로
  // 막지만 이름은 목록·헤더에 그대로 렌더된다 (code-review 2026-09-07 🟡5).
  // ⚠️ **트림이 검사보다 먼저다** — 순서가 반대면 공백만인 이름이 통과해 목록에 빈 줄로 뜬다
  // (2026-09-07 리뷰 ⚪15).
  name: z.string().trim().min(1).max(PROJECT_NAME_MAX_CHARS),
});

/**
 * 트랜잭션 안에서 던져 쓰기를 되돌리는 신호. 밖에서 잡아 `limit-reached`로 바꾼다 —
 * `LastOwnerRollback`과 같은 관용구다(사용자에게 예외를 보내지 않는다).
 */
class ProjectLimitRollback extends Error {
  constructor() {
    super("owner project limit reached");
    this.name = "ProjectLimitRollback";
  }
}

/** 잠금 뒤 다시 읽은 MCP 토큰이 무효이거나 `project:create`가 없다 — 던져서 생성 tx를 통째로 되돌린다(`ProjectLimitRollback`과 같은 관용구). */
class TokenRollback extends Error {
  constructor(readonly code: "unauthorized" | "token-scope") {
    super("api token rejected under lock");
    this.name = "TokenRollback";
  }
}

export type CreatedSurface = { surfaceSlug: string; pathTemplate: string; adapter: AdapterName; baseLocale: string };
export type CreateProjectResult =
  /** `defaultSurfaceSlug`는 MCP `create_project`가 `defaultSourceSlug`로 싣는 기본 표면이다(④는 2026-09-29부터 프로젝트 Home으로 간다). */
  | { ok: true; slug: string; defaultSurfaceSlug: string; pushToken: string; baseBranch: string; surfaces: CreatedSurface[]; count: number; yaml: string }
  | { ok: false; error: OnboardFailure | "path-conflict" | "token-scope";
      surface?: { pathTemplate: string; failed: number; errors: AdapterError[] };
      conflicts?: { path: string; surfaceSlugs: string[] }[];
      /** MCP 확인값 판정만 — 실패한 후보의 순번. */
      index?: number };

/**
 * **프로젝트 생성의 공유 코어** (mcp-connector T4-d) — 편집 UI ④와 MCP `create_project`. 모든 표면의 읽기·파싱을 끝낸 뒤 생성과 첫 적재를
 * 같은 트랜잭션에 저장한다. User 잠금 뒤 토큰 유효성·`project:create`를 다시 보고, 고른-범위 토큰이면 같은 tx에서 `projectIds`에 더한다.
 * 별도 클라이언트 `tokenId`나 범위 추가 플래그를 받지 않는다 — 주체가 든다. 재검증은 호출자의 몫이다.
 */
export async function createProjectFromRepo(
  prisma: PrismaClient,
  subject: Subject,
  input: z.infer<typeof CreateProjectInput>,
  /**
   * MCP `create_project`만 — `detect_formats`가 준 샘플 확인값, `input.surfaces`와 같은 순서(design §2.2). 주면 인가 뒤 읽은 **같은 스냅샷**의
   * head로 전부 대조하고 하나라도 실패하면 쓰기 0건이다. 웹은 주지 않는다(파일을 다시 읽어 `planConfirmedFormat`으로 검증하는 기존 계약).
   */
  options: { confirmations?: readonly (string | undefined)[] } = {},
): Promise<CreateProjectResult> {
  const { userId, tokenId } = subject;

  // ⚠️ **형식 규칙은 `lib/pull/trigger.ts`의 `REF_SAFE_SLUG`와 같은 정규식이다** — 갈리면 온보딩이
  // 만든 slug가 pull에서 `fail()`로 죽는다. 형식이 틀리면 GitHub을 부를 이유가 없다.
  if (planSlug(input.slug) !== "ok") return { ok: false, error: "invalid-slug" };
  // 모르는 어댑터는 아무 파일도 가리키지 못한다 — 조작된 입력이라 리포를 읽지 않는다.
  if (input.surfaces.some(surface => !isAdapterName(surface.adapter))) return { ok: false, error: "invalid input" };
  // 설정 화면과 **같은 함수**다 (`lib/pull/branch-name.ts`). 형식이 틀리면 GitHub을 부를 이유가 없다.
  if (!isValidBranchName(input.baseBranch)) {
    return { ok: false, error: "invalid-branch" };
  }
  // 자유 입력(300개 초과)·직접 호출도 막는다 — 목록 필터는 안내일 뿐이다 (malmoi#126).
  if (isSyncBranchName(input.baseBranch)) return { ok: false, error: "sync-branch" };

  const access = await checkRepoAccess(prisma, userId, input.owner, input.repo, true);
  if (access.status === "rejected") return { ok: false, error: access.error };

  const [ownerCount, existing] = await Promise.all([
    // 셈 조건은 `ownedActiveProjects` 하나다 — ①의 안내·아래 재집계와 갈리면 한쪽이 통과시킨 것을 다른 쪽이 거부한다.
    prisma.projectMember.count({ where: ownedActiveProjects(userId) }),
    // ⚠️ **전역 조회다** — slug는 `@unique`이고 "이미 쓰는 주소인가"는 테넌트 안에서 답할 수 없는
    // 질문이다 (§7.7의 대가). 돌려주는 것은 존재 여부뿐이고 화면에는 `slug-taken` 한 줄만 간다 —
    // 남의 프로젝트 이름·리포는 새지 않는다.
    prisma.project.findUnique({ where: { slug: input.slug }, select: { id: true } }),
  ]);

  /**
   * ⚠️ **연결 거부는 `checkRepoAccess`가 이미 값으로 돌려줬다** — 여기 오는 `connect`는 항상 ok다
   * (code-review 2026-09-07 🟡1). 그래도 `planProjectCreate`에 그것을 넘기는 이유는 **순서가 그
   * 함수에 문서화돼 있기** 때문이다: 연결 거부 → 제한 → 충돌. 두 층의 매핑이 같은지는
   * "슬롯이 없고 리포 접근도 없으면 연결 거부가 먼저" 테스트가 고정한다.
   */
  const plan = planProjectCreate({
    repoConnect: access.connect,
    ownerCount,
    slugTaken: existing !== null,
    limit: PROJECT_LIMIT,
  });
  if (plan.status !== "ok") return { ok: false, error: plan.status };

  const reader = await openRepoReader(plan.repoOwner, plan.repoName, plan.installationId, access.repositoryId);
  // ⚠️ **탐지와 저장이 같은 ref여야 한다** — 다른 트리로 재검증하면 통과한 포맷이 저장 브랜치에 없을 수 있다.
  const baseBranch = input.baseBranch;
  const snapshot = await reader.snapshot(baseBranch);
  if (snapshot.status !== "ok") return { ok: false, error: snapshotError(snapshot) };
  if (options.confirmations !== undefined) {
    // ⚠️ 검증과 적재가 같은 head다 — 아래 준비는 이 스냅샷의 blob sha로만 읽는다. 확인 뒤 ref를 다시 읽지 않는다.
    const verdict = planSampleConfirmations({
      candidates: input.surfaces.map((surface, index) => ({ ...surface, confirmation: options.confirmations?.[index] })),
      context: { userId, repositoryId: access.repositoryId, installationId: plan.installationId, ref: baseBranch, headSha: snapshot.headSha },
      secret: requireEnv("APP_SIGNING_SECRET"),
      now: new Date(),
    });
    // `index`는 어느 후보가 실패했는지다 — 에이전트가 그 후보만 다시 탐지한다.
    if (verdict.status !== "ok") return { ok: false, error: verdict.status === "invalid-input" ? "invalid input" : verdict.status, index: verdict.index };
  }

  const paths = snapshot.files.map(f => f.path);
  const projectId = randomUUID();
  const startedAt = new Date();
  const token = randomUUID();
  const prepared: { id: string; surface: CreatedSurface; payload: NonNullable<ReturnType<typeof prepareFirstSnapshot>["payload"]>; targets: string[]; workflow: { adapter?: AdapterName; baseLocale?: string } }[] = [];
  for (const requested of input.surfaces) {
    if (!isAdapterName(requested.adapter)) return { ok: false, error: "invalid input" };
    const attempted = templatePaths(requested.adapter, requested.pathTemplate, paths);
    try {
      const files = await readFiles(reader, snapshot, attempted);
      const confirmed = planConfirmedFormat(requested, files);
      if (confirmed.status !== "ok") {
        const missing = attempted.filter(path => !files.some(file => file.path === path));
        return { ok: false, error: missing.length ? "unavailable" : "manual-no-match",
          surface: { pathTemplate: requested.pathTemplate, failed: Math.max(1, missing.length),
            errors: missing.map(path => ({ path, code: "download-failed" })) } };
      }
      const format = confirmed.format;
      const targets = [...new Set([...attempted, ...ingestTargets(format, adapterFor(format).layout, paths)])];
      const extra = targets.filter(path => !attempted.includes(path));
      if (extra.length) files.push(...await readFiles(reader, snapshot, extra));
      const id = randomUUID();
      const surfaceSlug = planSurfaceSlug(format.pathTemplate, prepared.map(s => s.surface.surfaceSlug));
      const first = prepareFirstSnapshot({ projectId, surfaceId: id, surfaceSlug, startedAt, token,
        projectSlug: input.slug, format, baseLocale: confirmed.baseLocale,
        headSha: snapshot.headSha, headCommittedAt: snapshot.headCommittedAt, paths, targets,
        blobs: new Map(files.map(file => [file.path, file.content])),
      });
      if (first.payload === null || first.result.failed > 0) return { ok: false, error: "ingest-failed",
        surface: { pathTemplate: format.pathTemplate, failed: first.result.failed, errors: first.result.errors } };
      const resolved = resolveLocalePaths({ ...format, locales: first.payload.locales }, adapterFor(format).layout, paths);
      prepared.push({ id, surface: { surfaceSlug, adapter: format.adapter, pathTemplate: format.pathTemplate, baseLocale: confirmed.baseLocale },
        payload: first.payload, targets: [...targets, ...resolved.map(item => item.path)],
        // 설정 화면과 동일하게 확정한 포맷을 재현한다 — CI의 탐지 순위에 맡기지 않는다.
        workflow: { adapter: format.adapter, baseLocale: confirmed.baseLocale },
      });
    } catch (error) {
      logFailure("onboard-prepare", error);
      return { ok: false, error: error instanceof IngestBudgetError ? "resource-limit" : "ingest-failed",
        surface: { pathTemplate: requested.pathTemplate, failed: 1, errors: [] } };
    }
  }
  const ownership = surfaceOwnership(prepared.map(s => ({ surfaceId: s.id, surfaceSlug: s.surface.surfaceSlug, paths: s.targets })));
  if (!ownership.ok) return { ok: false, error: "path-conflict", conflicts: ownership.conflicts };
  const defaultSurface = selectDefaultSurface(prepared);
  if (defaultSurface === null) return { ok: false, error: "invalid input" };
  const yaml = renderProjectWorkflowYaml({ slug: input.slug, baseBranch, surfaces: prepared.map(s => ({
    surfaceSlug: s.surface.surfaceSlug, pathTemplate: s.surface.pathTemplate, ...s.workflow,
  })) });
  const pushToken = generatePushToken();
  let writingPath = defaultSurface.surface.pathTemplate;

  try {
    await prisma.$transaction(async (tx) => {
      /**
       * ⚠️ **같은 사용자의 동시 생성을 직렬화한다** (2026-09-07 리뷰 🟡7). 위 `ownerCount` 선조회는
       * 트랜잭션 밖이라 두 탭이 동시에 통과하면 슬롯이 셋인데 넷이 생기고, 삭제가 비범위라
       * 사용자가 그 슬롯을 되찾을 수 없다. `createInvitations`·`changeMember`가 프로젝트 행을
       * 잠그는 것과 같은 이유이고 — **생성 경로에는 잠글 프로젝트가 없으므로 대상이 `User`다.**
       * 선조회를 남겨 두는 것은 거부될 요청이 GitHub을 읽지 않게 하기 위해서다.
       */
      await tx.$executeRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      // MCP 토큰은 잠금 직후 다시 읽는다(mcp-connector design §1.25) — 대기 중 폐기·재발급됐으면 아무것도 만들지 않는다.
      const apiToken = await lockApiToken(tx, { tokenId, userId, projectId: null, grant: "project:create" });
      if (apiToken.status !== "ok") throw new TokenRollback("unauthorized");
      if (apiToken.grant === "token-scope") throw new TokenRollback("token-scope");
      const owned = await tx.projectMember.count({ where: ownedActiveProjects(userId) });
      if (owned >= PROJECT_LIMIT) throw new ProjectLimitRollback();

      const project = await tx.project.create({
        data: {
          // id가 nullable defaultSurface 복합 FK에도 쓰여 Prisma 7.10이 cuid 기본값을 누락한다.
          id: projectId,
          slug: input.slug,
          name: input.name,
          // 이름은 **probe가 준 현재 값**이다 — 리네임된 리포도 지금 이름으로 붙는다.
          repoOwner: plan.repoOwner,
          repoName: plan.repoName,
          // ⚠️ default가 `"main"`이라 **반드시 채운다** — default branch가 `develop`인 리포의
          // pull이 `main`을 찾아 `base-branch-missing`으로 죽는다 (ARCHITECTURE §3.1).
          baseBranch,
          installationId: plan.installationId,
          repositoryId: access.repositoryId,
          // 저장하는 것은 재탐지 결과다 — 클라이언트 입력이 아니다.
          pushTokenHash: hashPushToken(pushToken),
        },
        select: { id: true },
      });
      await tx.projectMember.create({ data: { projectId: project.id, userId, role: "OWNER" } });
      /**
       * ⚠️ **고른-프로젝트 범위 토큰이 만든 프로젝트는 같은 tx에서 그 토큰의 범위에 든다** (design §1.25) — 안 넣으면 방금 만든
       * 프로젝트를 그 토큰이 못 만진다. 해시까지 조건이라 재발급된 새 토큰에는 붙지 않는다. 전체 범위 토큰·세션은 0행이다.
       */
      if (tokenId !== undefined) {
        await tx.apiToken.updateMany({ where: { userId, tokenHash: tokenId, allProjects: false }, data: { projectIds: { push: project.id } } });
      }
      /**
       * ⚠️ **생성은 사건 셋이다** (결정 13): 생성 1 + **소스당** 1 + 최초 적재 1. 한 줄로 접으면
       * 나중에 추가한 소스가 **같은 일인데 다른 모양**으로 남고, 소스 필터가 그 한 줄을 어디에 넣을지
       * 애매해진다. 로케일·키는 독립 행을 만들지 않고 적재 실행의 집계로만 남는다.
       */
      await recordEvent(tx, {
        projectId: project.id,
        subtype: "settings.projectCreated",
        actor: { kind: "USER", userId },
        scope: "project-wide",
        payload: { kind: "SETTINGS", field: "project", value: { before: null, after: `${plan.repoOwner}/${plan.repoName}` } },
      });
      for (const item of prepared) {
        writingPath = item.surface.pathTemplate;
        await tx.translationSurface.create({ data: { id: item.id, projectId: project.id,
          slug: item.surface.surfaceSlug, adapterName: item.surface.adapter, pathTemplate: item.surface.pathTemplate,
          baseLocale: item.surface.baseLocale, lastImportStartedAt: startedAt, lastImportToken: token,
        } });
        await recordEvent(tx, {
          projectId: project.id,
          subtype: "surface.added",
          actor: { kind: "USER", userId },
          surfaceIds: [item.id],
          payload: { kind: "SURFACE", surfaceSlug: item.surface.surfaceSlug, adapter: item.surface.adapter,
            baseLocale: { before: null, after: item.surface.baseLocale } },
        });
        await applyPushInTransaction(tx, { projectId: project.id, surfaceId: item.id }, item.payload, {
          refsMode: "replace", previousBaseLocale: null, startedAt, token, importOutcome: null,
        });
      }
      /**
       * 최초 적재 실행 하나 — **소스별로 복제하지 않는다** (결정 14). 여기까지 온 것은 모든 표면의
       * `failed`가 0이라는 뜻이라(위에서 하나라도 실패하면 `ingest-failed`로 반환한다) 결과가
       * `Imported`로 고정이고, 그 사실을 소스별 결과로도 남긴다.
       */
      await recordRun(tx, {
        projectId: project.id,
        subtype: "import.first",
        actor: { kind: "USER", userId },
        surfaceIds: prepared.map(item => item.id),
        result: "imported",
        occurredAt: startedAt,
        finishedAt: new Date(),
        runToken: runTokenFor({ kind: "import", token }),
        payload: {
          kind: "IMPORT", source: "first",
          surfaceSlugs: prepared.map(item => item.surface.surfaceSlug),
          keys: prepared.reduce((sum, item) => sum + item.payload.keys.length, 0),
          pendingEdits: null,
          surfaces: prepared.map(item => ({ surfaceSlug: item.surface.surfaceSlug, status: "imported" as const, count: item.payload.keys.length, reason: null })),
          errorCode: null, refusal: null,
        },
      });
      /**
       * ⚠️ **수집 개시 시각을 생성 tx에서 쓴다** (spec §7.1). 신규 프로젝트는 이 순간부터 전부
       * 기록되므로 경계선이 없고, 기존 프로젝트는 구 writer 종료가 확인된 뒤 한 번 기록한다 —
       * 여기서 `now()`를 쓰는 것과 그것을 추정으로 채우는 것은 다른 일이다.
       */
      await tx.project.update({ where: { id: project.id }, data: { defaultSurfaceId: defaultSurface.id, activityCoverageStartedAt: startedAt } });
    }, { maxWait: 10_000, timeout: 30_000 });
  } catch (error) {
    // 잠금 안에서 센 결과가 넘쳤다 — 쓰기는 되돌아갔고 사용자에게는 선조회와 같은 사유가 간다.
    if (error instanceof ProjectLimitRollback) return { ok: false, error: "limit-reached" };
    if (error instanceof TokenRollback) return { ok: false, error: error.code };
    // ⚠️ **선조회를 지난 뒤의 경합이다** — 둘이 같은 slug로 동시에 들어오면 여기서 P2002가 난다.
    // 처리하지 않으면 digest만 있는 일반 오류가 되고 `planProjectCreate`가 만들어 둔 사유가 사라진다.
    if (isUniqueViolation(error)) return { ok: false, error: "slug-taken" };
    logFailure("onboard-create", error);
    return { ok: false, error: "ingest-failed", surface: { pathTemplate: writingPath, failed: 1, errors: [] } };
  }

  return { ok: true, slug: input.slug, defaultSurfaceSlug: defaultSurface.surface.surfaceSlug, pushToken, baseBranch, surfaces: prepared.map(s => s.surface),
    count: prepared.reduce((sum, s) => sum + s.payload.keys.length, 0), yaml };
}
