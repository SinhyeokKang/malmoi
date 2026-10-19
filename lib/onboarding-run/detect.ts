import "server-only";
import { z } from "zod";

import type { PrismaClient } from "@/generated/prisma/client";
import { adapterFor, detectCandidatesAcross } from "@/lib/adapters";
import { arbConfiguredFirst, arbProbePaths } from "@/lib/adapters/arb-catalog";
import { codeDictCandidatePaths } from "@/lib/adapters/code-dict";
import { compareKeys } from "@/lib/adapters/shared";
import type { AdapterFile, DetectedFormat } from "@/lib/adapters/types";
import type { AccessError } from "@/lib/auth/message";
import { getProjectAccess } from "@/lib/auth/query";
import type { Subject } from "@/lib/auth/subject";
import { requireEnv } from "@/lib/env";
import { openRepoReader } from "@/lib/repo-host";
import { connectionEvidence, projectReadTarget, REPO_COLUMNS, repoLocatorOf, repoTargetOf, sameAccessedRepository, newRepoTarget, type RepoTarget } from "@/lib/repo-host/target";
import { readFiles, snapshotError } from "@/lib/import/read";
import { IngestBudgetError } from "@/lib/onboarding/budget";
import { planConfirmedFormat, templatePaths } from "@/lib/onboarding/confirm";
import { ingestTargets, makeProbe, probeTargets, summarizeCandidates, type CandidateSummary } from "@/lib/onboarding/detect";
import { signSampleConfirmation } from "@/lib/onboarding/sample-confirmation";
import { isValidBranchName } from "@/lib/pull/branch-name";
import { resolveLocalePaths } from "@/lib/pull/plan";
import { isSyncBranchName } from "@/lib/pull/ref-slug";

import { projectDisconnected } from "@/lib/gitlab-connect/errors";
import { checkRepoAccess, type OnboardFailure } from "./access";
import { GitHubRepoInput, GitLabRepoInput, newRepoLocator } from "./locator";

export const RepoInput = GitHubRepoInput;
export const DetectInput = RepoInput.extend({ ref: z.string().min(1).optional() });
/** GitLab ①의 탐지 입력 — 리포는 숫자 id다(`./locator`). 웹 Action이 GitHub 입력과 union으로 받는다. MCP 도구 입력은 D2가 정한다. */
export const GitLabDetectInput = GitLabRepoInput.extend({ ref: z.string().min(1).optional() });

export type DetectResult =
  | { ok: true; candidates: CandidateSummary[] }
  | { ok: false; error: OnboardFailure };

/**
 * **탐지의 공유 코어** (mcp-connector T4-c) — 편집 UI ③과 MCP `detect_formats`(신규 경로). **2패스다** (ARCHITECTURE §3.1).
 * 인가는 `checkRepoAccess`(리포 쓰기 권한 포함)다. 후보마다 샘플 확인값에 서명한다 — 생성·추가가 그것을 소비한다.
 */
export async function detectFormats(
  prisma: PrismaClient,
  subject: Subject,
  input: z.infer<typeof DetectInput> | z.infer<typeof GitLabDetectInput>,
): Promise<DetectResult> {
  const { ref } = input;
  const { userId } = subject;
  // 잎 판정이라 비용이 0이다 — 맨값을 GitHub URL에 넣기 전에 여기서 막는다.
  if (ref !== undefined && !isValidBranchName(ref)) return { ok: false, error: "invalid input" };
  // ③까지 가서 생성이 거부되지 않게 여기서 막는다 (malmoi#126).
  if (ref !== undefined && isSyncBranchName(ref)) return { ok: false, error: "sync-branch" };

  const access = await checkRepoAccess(prisma, userId, newRepoLocator(input), { requirePush: true });
  if (access.status !== "ok") return { ok: false, error: access.error };
  // 새 리포 — 프로젝트가 없으니 호출자 자신의 연결로 연다.
  return detectIn(userId, newRepoTarget(access), ref ?? access.defaultBranch);
}

/**
 * **기존 프로젝트의 탐지** (MCP `detect_formats({ slug })` — design §2.1). 인가된 프로젝트에 **저장된** 리포와 base branch로만 탐지한다 —
 * 호출자가 리포·ref를 바꿀 수 없다. OWNER(`project:settings`) + GitHub 리포 쓰기 권한을 확인하고, 확인한 리포 id를 고정된
 * `Project.repositoryId`와 대조한다. 후보와 확인값은 `add_sources`가 소비한다. 거부됐다고 신규 탐지로 자동 전환하지 않는다.
 */
export async function detectProjectFormats(prisma: PrismaClient, subject: Subject, input: { slug: string }): Promise<DetectResult | { ok: false; error: AccessError }> {
  const { userId } = subject;
  const project = await getProjectAccess(prisma, { userId, slug: input.slug, permission: "project:settings" });
  if (project.status !== "ok") return { ok: false, error: project.status };
  const row = await prisma.project.findUnique({
    where: { id: project.projectId },
    select: { ...REPO_COLUMNS, baseBranch: true },
  });
  if (row === null) return { ok: false, error: "not-found" };
  const connection = repoTargetOf(row);
  if (connection.status !== "ok") return { ok: false, error: projectDisconnected(row.repoHost) };
  const access = await checkRepoAccess(prisma, userId, repoLocatorOf(row), { requirePush: true });
  if (access.status !== "ok") return { ok: false, error: access.error };
  // 같은 이름의 **다른** 리포는 이 프로젝트가 아니다 — 고정된 신원으로 대조한다(`listLinkedBranches`와 같은 규칙).
  if (!sameAccessedRepository(access, connection.target)) return { ok: false, error: "repo-forbidden" };
  return detectIn(userId, projectReadTarget(access, connection.target), row.baseBranch);
}

/** 인가를 지난 리포 하나의 2패스 탐지 + 후보별 확인값 서명. `APP_SIGNING_SECRET`이 비면 던진다 — 호출자가 장애로 접는다. */
async function detectIn(userId: string, target: RepoTarget, ref: string): Promise<DetectResult> {
  // 프로젝트가 있으면 위에서 같은 리포임을 대조했다 — GitHub은 확인한 접근(같은 설치), GitLab은 프로젝트가 참조하는 연결로 연다.
  const reader = await openRepoReader(target);
  const snapshot = await reader.snapshot(ref);
  if (snapshot.status !== "ok") return { ok: false, error: snapshotError(snapshot) };

  const paths = snapshot.files.map((f) => f.path);
  // 1패스: probe 없이 경로 모양만. code-dict는 여기서 후보가 0개이고 probe가 그것을 **만든다**.
  // ⚠️ 세 번째 인자가 **경로 전체**다 — ts-dict는 1패스 후보가 0이라 씨앗을 여기서만 만들 수 있다.
  // ⚠️ ARB 설정(`l10n.yaml`)을 **먼저** 읽는다 — 그것이 가리키는 후보가 1패스 순위로 probe 상한 밖에 밀리면 2패스가 내용 없이 만나
  // 검증에서 떨어뜨린다(리뷰 R1). 설정 파일은 원래도 표본 하나라 예산은 그대로이고, 같은 파일을 두 번 읽지 않는다.
  const configPaths = arbProbePaths(paths);
  let files: AdapterFile[];
  try {
    const config = configPaths.length === 0 ? [] : await readFiles(reader, snapshot, configPaths);
    const firstPass = arbConfiguredFirst(detectCandidatesAcross(paths), config[0]?.content);
    const targets = probeTargets(firstPass, codeDictCandidatePaths(paths), paths).filter((path) => !configPaths.includes(path));
    files = [...config, ...await readFiles(reader, snapshot, targets)];
  }
  catch (error) {
    if (error instanceof IngestBudgetError) return { ok: false, error: "resource-limit" };
    throw error;
  }
  const blobs = new Map(files.map((f) => [f.path, f.content]));

  // 2패스: 내려받은 내용으로 검증된 후보만 남는다.
  const summaries = summarizeCandidates(detectCandidatesAcross(paths, makeProbe(blobs)), blobs);
  if (summaries.length === 0) return { ok: false, error: "no-candidates" };

  const candidates = summaries.flatMap((summary) => {
    const selectedPaths = new Set(templatePaths(summary.adapter, summary.pathTemplate, paths, summary.basePath ?? null));
    const confirmed = planConfirmedFormat({ ...summary, baseLocale: summary.baseLocale }, files.filter((file) => selectedPaths.has(file.path)));
    if (confirmed.status !== "ok") return [];
    return [{ ...summary, outputPaths: candidateOutputPaths({ ...confirmed.format, locales: summary.locales }, paths, summary.baseLocale), confirmation: signSampleConfirmation({
      userId, repositoryId: target.repositoryId, connection: connectionEvidence(target),
      ref, headSha: snapshot.headSha,
      // 전 언어의 경로는 전체 트리 탐지가 확인했다. 내용을 받은 셋으로 줄이면 lazy 언어가 사라진다.
      format: { ...confirmed.format, locales: summary.locales, baseLocale: summary.baseLocale },
    }, requireEnv("APP_SIGNING_SECRET"), new Date()) }];
  });
  return candidates.length === 0 ? { ok: false, error: "no-candidates" } : { ok: true, candidates };
}

/** 추가 읽기 없이 확정 포맷과 같은 snapshot의 전체 경로로 소유 범위를 계산한다. */
export function candidateOutputPaths(format: DetectedFormat, paths: readonly string[], baseLocale: string): string[] {
  const layout = adapterFor(format).layout;
  return [...new Set([
    ...templatePaths(format.adapter, format.pathTemplate, paths, format.basePath ?? null),
    ...ingestTargets(format, layout, paths, baseLocale),
    ...resolveLocalePaths(format, layout, paths, baseLocale).map(item => item.path),
  ])].sort(compareKeys);
}
