import { fail } from "@/lib/failure";
import { adapterFor } from "@/lib/adapters";
import { adapterErrorMessage } from "@/lib/i18n/adapter-errors";
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
  saveLastPulledAt(projectId: string, at: Date, published?: { prUrl: string }): Promise<void>;
  syncBranch: string;
};

/**
 * `warnings`는 writer가 **버린** 항목이다 (`파일: 메시지`). 값을 잃고도 조용하면 안 된다 —
 * json-catalog 접두 충돌(ARCHITECTURE §1.35)이 대표다. **있을 때만 싣는다** — 빈 배열을 항상
 * 실으면 결과 모양이 바뀌어 소비자마다 분기가 늘고, 없는 것과 같아야 하는 값이다.
 */
export type PullResult =
  | { status: "skipped"; reason: "no-edits" | "no-changes"; warnings?: string[] }
  | {
      status: "committed";
      /**
       * 열린 PR이 있었는지 — 화면 문구가 갈린다("Sent for review" vs "Updated what you sent earlier").
       * `findOpenPrUrl`의 결과로 이미 알고 있던 것을 값으로 안 내고 있었다 (design §3.4).
       */
      pr: "created" | "updated";
      commitSha: string;
      prUrl: string;
      changed: string[];
      warnings?: string[];
    };

/** blob 동시 읽기 수. GitHub 2차 rate limit(동시 요청)을 피하면서 106파일을 60초 안에 든다. */
const BLOB_CONCURRENCY = 8;

export async function runPull(deps: PullDeps): Promise<PullResult> {
  const { project, localeCodes, keys, maxUpdatedAt } = await deps.loadState();

  // ── 1층: DB 측 스킵. 여기서 끝나면 GitHub을 한 번도 부르지 않는다 ────────────
  if (shouldSkipPull(maxUpdatedAt, project.lastPulledAt)) {
    return { status: "skipped", reason: "no-edits" };
  }
  // `shouldSkipPull`이 `maxUpdatedAt === null`이면 true를 주므로 여기선 non-null이다.
  // 조용한 폴백(`?? new Date(0)`)을 두지 않는다 — 그 값이 DB에 들어가면 1층이 영구히 무력해진다.
  if (maxUpdatedAt === null) fail("unreachable: passed the layer-1 check but maxUpdatedAt is null");
  // 이 값이 `lastPulledAt`에 들어간다 — `now()`를 쓰면 export 스냅샷과 갱신 사이에 들어온
  // 편집이 다음 실행에서 영영 스킵된다.
  const captured = maxUpdatedAt;

  // GitHub을 부르기 전에 막는다 — 설치가 안 됐으면 조용히 빈 PR을 내는 대신 즉시 알린다.
  if (project.installationId === null) {
    fail(`Project.installationId is empty (${project.slug}) — install the app`);
  }

  const format = formatFromProject(project, localeCodes);
  // `formatFromProject`가 null이면 이미 던졌다 — 여기선 non-null이므로 좁혀서 쓴다.
  // 빈 문자열로 폴백하면 base 판정이 전부 false가 되어 base 파일이 조용히 폴백을 잃는다.
  const { baseLocale } = project;
  if (baseLocale === null) fail("unreachable: passed formatFromProject but baseLocale is null");
  const { layout } = adapterFor(format);
  const client = await deps.createClient(project);

  const baseHead = await client.getRefSha(`heads/${project.baseBranch}`);
  // ⚠️ **`null`을 "브랜치 없음"으로 읽고 진행하지 않는다.** GitHub은 권한 없는 리소스에 404를
  // 주므로 설치 취소·권한 누락도 `null`로 온다. base가 없으면 그 자체로 진행 불가다
  // (`l10n/sync`의 `null`만 정상 입력이다 — 첫 실행 경로).
  if (baseHead === null) {
    fail(
`cannot read the base branch: ${project.baseBranch} (missing branch, or the app lacks access)`,
    );
  }

  const tree = await client.getTree(baseHead);
  const paths = resolveLocalePaths(
    format,
    layout,
    tree.map((t) => t.path),
  );

  // **어댑터 종류와 무관하게 원본을 읽는다.** 두 방식이 원본을 쓰는 이유가 다르다:
  //   - 수술적 치환 — write에 **필수**다. 없으면 치환할 대상이 없어 파일을 안 낸다 (§1.4)
  //   - 재생성 — **표현**(들여쓰기)만 읽는다. 없으면 기본값으로 떨어지고 파일은 그대로 낸다
  //
  // ⚠️ 전에는 `writeStrategy === "surgical"`일 때만 읽어 파일당 blob 1회를 아꼈다. 그 최적화의
  // 대가가 재생성 리포 71개 중 **30개**에서 "값 편집 0건인데 모든 줄이 바뀌는" diff였다
  // (`ADAPTER-COVERAGE.md` §11.3). 1층(DB 측 스킵)이 편집 없는 날을 이미 걸러내므로, 늘어나는
  // 것은 **편집이 있었던 날**의 비용뿐이다.
  // 파일 수만큼의 왕복이라 **제한 병렬**로 읽는다 — 실측 최대 106로케일이고 라우트의
  // `maxDuration`이 60초다. 직렬이면 그 한 리포가 cron을 넘긴다 (2026-09-04 audit #18).
  const shaByPath = new Map(tree.map((t) => [t.path, t.sha]));
  const current = new Map<string, string>();
  const targets = paths.filter((p) => shaByPath.has(p.path));
  for (let i = 0; i < targets.length; i += BLOB_CONCURRENCY) {
    const chunk = targets.slice(i, i + BLOB_CONCURRENCY);
    const texts = await Promise.all(chunk.map((p) => client.getBlobText(shaByPath.get(p.path)!)));
    chunk.forEach((p, j) => current.set(p.path, texts[j]!));
  }

  const local = renderLocaleFiles(format, layout, paths, keys, baseLocale, current);
  const warnings = local.flatMap((f) => (f.errors ?? []).map((e) => `${e.path}: ${adapterErrorMessage(e)}`));
  const withWarnings = warnings.length === 0 ? {} : { warnings };

  // ── 2층: blob SHA 비교 ──────────────────────────────────────────────────────
  const changes = planPullChanges(
    local,
    tree.map((t) => ({ path: t.path, sha: t.sha })),
  );
  if (changes.length === 0) {
    /**
     * ⚠️ **sync 브랜치가 base보다 앞서 있으면 되돌린다** (2026-09-09, T6 실측 발견 B).
     *
     * 2층이 비교하는 것은 **base 트리**다 — 사용자가 편집을 되돌려 렌더가 base와 같아지면 변경
     * 0건이라 커밋을 만들지 않고, 그때 `l10n/sync-<slug>`는 **직전 스냅샷 그대로** 남는다. 그 PR을
     * 머지하면 **되돌린 편집이 리포에 적용된다.** ARCHITECTURE §3이 그 브랜치를 "현재 DB 상태의
     * 스냅샷"이라 부르는데, 이 경로에서 그 불변식이 깨져 있었다.
     *
     * 불변식을 바꾸는 것이 아니라 지키는 것이다: base head를 가리키게 하면 그 시점의 DB 상태
     * (= base와 동일)를 정확히 가리킨다. PR은 재사용 규칙대로 열린 채 남고 diff만 0이 된다.
     *
     * ⚠️ **읽기 1회가 늘어나는 곳은 여기뿐이다** — 편집이 있었던 실행만 이 줄에 닿는다.
     * 1층 스킵의 "GitHub API 0회"(spec 완료 조건 4)는 그대로다.
     */
    const staleHead = await client.getRefSha(`heads/${deps.syncBranch}`);
    // 브랜치 부재는 정상 상태다(첫 실행 전) — 되돌릴 것이 없고, 여기서 만들지도 않는다.
    if (staleHead !== null && staleHead !== baseHead) {
      await client.updateRefForce(deps.syncBranch, baseHead);
    }
    // **커밋이 안 나갔어도 갱신한다** — 그 순간 export == base 트리가 검증된 상태다.
    // 안 하면 값 불변 push 한 번 뒤 매일 밤 트리(그리고 수술적이면 blob 파일 수만큼)를 다시 읽는다.
    // ⚠️ `published`를 넘기지 않는다 — 되돌리기는 "보낸" 것이 아니다 (design §3.4).
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
  // **보낸 것의 링크가 새로고침을 넘어야 한다** — cron 경로도 여기를 지나므로 야간 pull이 만든 PR도 남는다.
  await deps.saveLastPulledAt(project.id, captured, { prUrl });

  return {
    status: "committed",
    pr: existing === null ? "created" : "updated",
    commitSha,
    prUrl,
    changed: changes.map((c) => c.path),
    ...withWarnings,
  };
}
