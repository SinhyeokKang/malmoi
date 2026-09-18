import "server-only";

import type { RepoReader, RepoSnapshot } from "@/lib/github";
import type { AdapterFile } from "@/lib/adapters/types";
import type { OnboardError } from "@/lib/onboarding/message";
import { checkDownloadBudget, checkContentBudget } from "@/lib/onboarding/budget";

/**
 * 트리 항목의 `sha`로 내려받는다 — contents API는 1MB에서 잘려 조용히 빈 내용을 준다.
 *
 * 못 읽은 파일은 **빠진다.** 탐지에서는 그 후보가 "키 수 확인 실패"로 남고(ARCHITECTURE §4의 연장),
 * 첫 적재에서는 `targets`와 대조해 **실패로 센다** — 조용히 빼면 성공 문구가 나간다 (불변식 9).
 */
export async function readFiles(
  reader: RepoReader,
  snapshot: Extract<RepoSnapshot, { status: "ok" }>,
  paths: readonly string[],
): Promise<AdapterFile[]> {
  checkDownloadBudget(paths, snapshot.files);
  let totalBytes = 0;
  const shaByPath = new Map(snapshot.files.map((f) => [f.path, f.sha]));
  const out: AdapterFile[] = [];
  // 순차로 받는다 — 한 번에 던지면 secondary rate limit에 걸리고, 예산이 ≤37개(탐지) 또는
  // 로케일 파일 수(첫 적재)라 `maxDuration=60` 안에 든다 (ARCHITECTURE §3.1).
  for (const path of paths) {
    const sha = shaByPath.get(path);
    if (sha === undefined) continue;
    const content = await reader.blob(sha);
    if (content === undefined) continue;
    totalBytes = checkContentBudget(path, content, totalBytes);
    out.push({ path, content });
  }
  return out;
}

/**
 * 스냅샷의 비-ok 갈래 → 화면 문구가 있는 사유.
 *
 * ⚠️ **`truncated`에는 수동 지정으로 가는 길이 없다** (2026-09-07 정정 — 전 주석은 반대로 적혀 있었다).
 * 확정의 재검증(`planConfirmedFormat`)이 **같은 잘린 스냅샷**을 읽으므로 같은 갈래를 다시 낸다.
 * 문구도 그렇게 말한다 (`onboardErrorMessage`).
 */
export function snapshotError(snapshot: Exclude<RepoSnapshot, { status: "ok" }>): OnboardError {
  if (snapshot.status === "truncated") return "tree-truncated";
  if (snapshot.status === "base-branch-missing") return "base-branch-missing";
  return "unavailable";
}

