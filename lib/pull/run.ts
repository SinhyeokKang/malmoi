import { adapterFor } from "@/lib/adapters";
import type { GitClient } from "./client";
import { buildCommitPayload, buildTreePayload } from "./payload";
import {
  formatFromProject,
  planPullChanges,
  resolveLocalePaths,
  shouldSkipPull,
  type ProjectFormatColumns,
} from "./plan";
import { renderLocaleFiles, type RenderKey } from "./render";

/**
 * pull 오케스트레이션. **판정은 전부 `plan.ts`·`payload.ts`·`render.ts`에 있고** 여기는 순서와
 * 의존성 주입만 맡는다. DB와 GitHub이 인자로 들어오므로 fake로 호출 수를 셀 수 있다 —
 * spec 완료 조건 4("편집이 없으면 API 0회")를 판정할 다른 방법이 없다.
 *
 * ⚠️ `server-only`를 붙이지 않는다 — 테스트가 직접 import한다.
 */

export type PullProject = ProjectFormatColumns & {
  id: string;
  slug: string;
  repoOwner: string;
  repoName: string;
  baseBranch: string;
  installationId: string | null;
  lastPulledAt: Date | null;
};

export type PullState = {
  project: PullProject;
  localeCodes: string[];
  keys: RenderKey[];
  /** 그 프로젝트 `Translation.updatedAt`의 최대값. 편집이 0건이면 `null`. */
  maxUpdatedAt: Date | null;
};

export type PullDeps = {
  loadState(): Promise<PullState>;
  createClient(project: PullProject): Promise<GitClient>;
  /**
   * 2층까지 통과했을 때 부른다 — 커밋이 나갔든(성공 후), 변경이 없었든(export == base 트리가 검증된
   * 순간). **실패 경로에서는 부르지 않는다** — 먼저 쓰면 그 편집이 영영 스킵된다 (아래 두 호출 주석).
   */
  saveLastPulledAt(projectId: string, at: Date): Promise<void>;
  syncBranch: string;
};

/**
 * `warnings`는 writer가 **버린** 항목이다 (`파일: 메시지`). 값을 잃고도 조용하면 안 된다 —
 * json-catalog 접두 충돌(ARCHITECTURE §1.35)이 대표다. **있을 때만 싣는다** — 빈 배열을 항상
 * 실으면 결과 모양이 바뀌어 소비자마다 분기가 늘고, 없는 것과 같아야 하는 값이다.
 */
export type PullResult =
  | { status: "skipped"; reason: "no-edits" | "no-changes"; warnings?: string[] }
  | { status: "committed"; commitSha: string; prUrl: string; changed: string[]; warnings?: string[] };

export async function runPull(deps: PullDeps): Promise<PullResult> {
  const { project, localeCodes, keys, maxUpdatedAt } = await deps.loadState();

  // ── 1층: DB 측 스킵. 여기서 끝나면 GitHub을 한 번도 부르지 않는다 ────────────
  if (shouldSkipPull(maxUpdatedAt, project.lastPulledAt)) {
    return { status: "skipped", reason: "no-edits" };
  }
  // `shouldSkipPull`이 `maxUpdatedAt === null`이면 true를 주므로 여기선 non-null이다.
  // 조용한 폴백(`?? new Date(0)`)을 두지 않는다 — 그 값이 DB에 들어가면 1층이 영구히 무력해진다.
  if (maxUpdatedAt === null) throw new Error("도달 불가: 1층 판정을 통과했는데 maxUpdatedAt이 null이다");
  // 이 값이 `lastPulledAt`에 들어간다 — `now()`를 쓰면 export 스냅샷과 갱신 사이에 들어온
  // 편집이 다음 실행에서 영영 스킵된다.
  const captured = maxUpdatedAt;

  // GitHub을 부르기 전에 막는다 — 설치가 안 됐으면 조용히 빈 PR을 내는 대신 즉시 알린다.
  if (project.installationId === null) {
    throw new Error(`Project.installationId가 비어 있다 (${project.slug}) — App을 설치한다`);
  }

  const format = formatFromProject(project, localeCodes);
  // `formatFromProject`가 null이면 이미 던졌다 — 여기선 non-null이므로 좁혀서 쓴다.
  // 빈 문자열로 폴백하면 base 판정이 전부 false가 되어 base 파일이 조용히 폴백을 잃는다.
  const { baseLocale } = project;
  if (baseLocale === null) throw new Error("도달 불가: formatFromProject를 통과했는데 baseLocale이 null이다");
  const { layout, writeStrategy } = adapterFor(format);
  const client = await deps.createClient(project);

  const baseHead = await client.getRefSha(`heads/${project.baseBranch}`);
  // ⚠️ **`null`을 "브랜치 없음"으로 읽고 진행하지 않는다.** GitHub은 권한 없는 리소스에 404를
  // 주므로 설치 취소·권한 누락도 `null`로 온다. base가 없으면 그 자체로 진행 불가다
  // (`l10n/sync`의 `null`만 정상 입력이다 — 첫 실행 경로).
  if (baseHead === null) {
    throw new Error(
      `base 브랜치를 읽을 수 없다: ${project.baseBranch} (브랜치 부재 또는 App 권한 누락)`,
    );
  }

  const tree = await client.getTree(baseHead);
  const paths = resolveLocalePaths(
    format,
    layout,
    tree.map((t) => t.path),
  );

  // 수술적 치환은 write에 원본이 필요하다 (ARCHITECTURE §1.4). 재생성 어댑터는 건너뛴다 —
  // 파일당 blob 읽기 1회를 아끼는 지점이고, 1층이 이미 대부분을 걸렀다.
  //
  // ⚠️ **`layout`이 아니라 `writeStrategy`로 판단한다.** 전에는 `multi-locale`로 갈랐는데
  // `yaml-catalog`·`code-dict`가 **`per-locale`인데 수술적**이라 그 판단이 성립하지 않는다 —
  // 원본 없이 write에 들어가면 `null`을 받아 **PR이 조용히 비어 나간다** (ARCHITECTURE §1).
  const current = new Map<string, string>();
  if (writeStrategy === "surgical") {
    for (const p of paths) {
      const blob = tree.find((t) => t.path === p.path);
      if (blob) current.set(p.path, await client.getBlobText(blob.sha));
    }
  }

  const local = renderLocaleFiles(format, layout, paths, keys, baseLocale, current);
  const warnings = local.flatMap((f) => (f.errors ?? []).map((e) => `${e.path}: ${e.message}`));
  const withWarnings = warnings.length === 0 ? {} : { warnings };

  // ── 2층: blob SHA 비교 ──────────────────────────────────────────────────────
  const changes = planPullChanges(
    local,
    tree.map((t) => ({ path: t.path, sha: t.sha })),
  );
  if (changes.length === 0) {
    // **커밋이 안 나갔어도 갱신한다** — 그 순간 export == base 트리가 검증된 상태다.
    // 안 하면 값 불변 push 한 번 뒤 매일 밤 트리(그리고 수술적이면 blob 파일 수만큼)를 다시 읽는다.
    await deps.saveLastPulledAt(project.id, captured);
    return { status: "skipped", reason: "no-changes", ...withWarnings };
  }

  const summary = `${changes.length} file${changes.length === 1 ? "" : "s"}`;
  const treeSha = await client.createTree(buildTreePayload(changes, baseHead));
  const commitSha = await client.createCommit(buildCommitPayload(treeSha, baseHead, summary));

  // 브랜치가 없으면 생성, 있으면 force로 옮긴다. `l10n/sync`는 누적 히스토리가 아니라
  // "현재 DB 상태의 스냅샷"이다 (ARCHITECTURE §3).
  const syncHead = await client.getRefSha(`heads/${deps.syncBranch}`);
  if (syncHead === null) {
    await client.createRef(deps.syncBranch, commitSha);
  } else {
    await client.updateRefForce(deps.syncBranch, commitSha);
  }

  // `owner:branch` 형식이어야 필터가 걸린다 — 브랜치명만 넘기면 GitHub이 조용히 무시해
  // 전체 목록이 오고, 재사용 판정이 무너져 PR이 중복 생성된다.
  const head = `${project.repoOwner}:${deps.syncBranch}`;
  const existing = await client.findOpenPrUrl(head, project.baseBranch);
  const prUrl =
    existing ??
    (await client.createPr(
      deps.syncBranch,
      project.baseBranch,
      "l10n: sync translations",
      // 영문이다 — 대상 리포에 남는 문자열이고 CLAUDE.md가 PR title/body를 영문으로 못 박았다.
      `Updated ${summary} from the translation DB.\n\n${changes.map((c) => `- \`${c.path}\``).join("\n")}\n\nThis branch is a snapshot, not a history: it is force-updated on every pull.`,
    ));

  // 마지막에 쓴다 — 먼저 쓰면 실패한 pull이 다음 실행을 스킵시켜 편집이 영영 안 나간다.
  await deps.saveLastPulledAt(project.id, captured);

  return { status: "committed", commitSha, prUrl, changed: changes.map((c) => c.path), ...withWarnings };
}
