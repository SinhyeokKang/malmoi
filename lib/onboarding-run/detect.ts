import "server-only";
import { z } from "zod";

import type { PrismaClient } from "@/generated/prisma/client";
import { adapterFor, detectCandidatesAcross } from "@/lib/adapters";
import { codeDictCandidatePaths } from "@/lib/adapters/code-dict";
import { compareKeys } from "@/lib/adapters/shared";
import type { AdapterFile, DetectedFormat } from "@/lib/adapters/types";
import type { Subject } from "@/lib/auth/subject";
import { requireEnv } from "@/lib/env";
import { openRepoReader } from "@/lib/github";
import { readFiles, snapshotError } from "@/lib/import/read";
import { IngestBudgetError } from "@/lib/onboarding/budget";
import { planConfirmedFormat, templatePaths } from "@/lib/onboarding/confirm";
import { ingestTargets, makeProbe, probeTargets, summarizeCandidates, type CandidateSummary } from "@/lib/onboarding/detect";
import { signSampleConfirmation } from "@/lib/onboarding/sample-confirmation";
import { isValidBranchName } from "@/lib/pull/branch-name";
import { resolveLocalePaths } from "@/lib/pull/plan";
import { isSyncBranchName } from "@/lib/pull/ref-slug";

import { checkRepoAccess, type OnboardFailure } from "./access";

export const RepoInput = z.object({ owner: z.string().min(1), repo: z.string().min(1) });
export const DetectInput = RepoInput.extend({ ref: z.string().min(1).optional() });

export type DetectResult =
  | { ok: true; candidates: CandidateSummary[] }
  | { ok: false; error: OnboardFailure };

/**
 * **탐지의 공유 코어** (mcp-connector T4-c) — 편집 UI ③과 MCP `detect_formats`(신규 경로). **2패스다** (ARCHITECTURE §3.1).
 * 인가는 `checkRepoAccess`(리포 쓰기 권한 포함)다. 후보마다 샘플 확인값에 서명한다 — 생성·추가가 그것을 소비한다.
 */
export async function detectFormats(prisma: PrismaClient, subject: Subject, input: z.infer<typeof DetectInput>): Promise<DetectResult> {
  const { owner, repo, ref } = input;
  const { userId } = subject;
  // 잎 판정이라 비용이 0이다 — 맨값을 GitHub URL에 넣기 전에 여기서 막는다.
  if (ref !== undefined && !isValidBranchName(ref)) return { ok: false, error: "invalid input" };
  // ③까지 가서 생성이 거부되지 않게 여기서 막는다 (malmoi#126).
  if (ref !== undefined && isSyncBranchName(ref)) return { ok: false, error: "sync-branch" };

  const access = await checkRepoAccess(prisma, userId, owner, repo, true);
  if (access.status !== "ok") return { ok: false, error: access.error };

  const reader = await openRepoReader(access.repoOwner, access.repoName, access.installationId, access.repositoryId);
  const snapshot = await reader.snapshot(ref ?? access.defaultBranch);
  if (snapshot.status !== "ok") return { ok: false, error: snapshotError(snapshot) };

  const paths = snapshot.files.map((f) => f.path);
  // 1패스: probe 없이 경로 모양만. code-dict는 여기서 후보가 0개이고 probe가 그것을 **만든다**.
  // ⚠️ 세 번째 인자가 **경로 전체**다 — ts-dict는 1패스 후보가 0이라 씨앗을 여기서만 만들 수 있다.
  const targets = probeTargets(detectCandidatesAcross(paths), codeDictCandidatePaths(paths), paths);
  let files: AdapterFile[];
  try { files = await readFiles(reader, snapshot, targets); }
  catch (error) {
    if (error instanceof IngestBudgetError) return { ok: false, error: "resource-limit" };
    throw error;
  }
  const blobs = new Map(files.map((f) => [f.path, f.content]));

  // 2패스: 내려받은 내용으로 검증된 후보만 남는다.
  const summaries = summarizeCandidates(detectCandidatesAcross(paths, makeProbe(blobs)), blobs);
  if (summaries.length === 0) return { ok: false, error: "no-candidates" };

  const candidates = summaries.flatMap((summary) => {
    const selectedPaths = new Set(templatePaths(summary.adapter, summary.pathTemplate, paths));
    const confirmed = planConfirmedFormat({ ...summary, baseLocale: summary.baseLocale }, files.filter((file) => selectedPaths.has(file.path)));
    if (confirmed.status !== "ok") return [];
    return [{ ...summary, outputPaths: candidateOutputPaths({ ...confirmed.format, locales: summary.locales }, paths), confirmation: signSampleConfirmation({
      userId, repositoryId: access.repositoryId, installationId: access.installationId,
      ref: ref ?? access.defaultBranch, headSha: snapshot.headSha,
      // 전 언어의 경로는 전체 트리 탐지가 확인했다. 내용을 받은 셋으로 줄이면 lazy 언어가 사라진다.
      format: { ...confirmed.format, locales: summary.locales },
    }, requireEnv("APP_SIGNING_SECRET"), new Date()) }];
  });
  return candidates.length === 0 ? { ok: false, error: "no-candidates" } : { ok: true, candidates };
}

/** 추가 읽기 없이 확정 포맷과 같은 snapshot의 전체 경로로 소유 범위를 계산한다. */
export function candidateOutputPaths(format: DetectedFormat, paths: readonly string[]): string[] {
  const layout = adapterFor(format).layout;
  return [...new Set([
    ...templatePaths(format.adapter, format.pathTemplate, paths),
    ...ingestTargets(format, layout, paths),
    ...resolveLocalePaths(format, layout, paths).map(item => item.path),
  ])].sort(compareKeys);
}
