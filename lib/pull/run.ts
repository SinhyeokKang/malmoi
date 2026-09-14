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
import { compareSurfaces, surfaceOwnership } from "@/lib/surfaces/plan";
import { planMultiSurfacePull } from "./surfaces";

/**
 * pull 오케스트레이션. **판정은 전부 `plan.ts`·`payload.ts`·`render.ts`에 있고** 여기는 순서와
 * 의존성 주입만 맡는다. DB와 GitHub이 인자로 들어오므로 fake로 호출 수를 셀 수 있다 —
 * spec 완료 조건 4("편집이 없으면 API 0회")를 판정할 다른 방법이 없다.
 *
 * ⚠️ `server-only`를 붙이지 않는다 — 테스트가 직접 import한다.
 */

export type PullProject = {
  id: string;
  slug: string;
  repoOwner: string;
  repoName: string;
  baseBranch: string;
  installationId: string | null;
  repositoryId?: string | null;
  lastPulledAt: Date | null;
};

export type PullState = {
  project: PullProject;
  surfaces: (ProjectFormatColumns & { id: string; slug: string; localeCodes: string[]; keys: RenderKey[] })[];
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
  const { project, surfaces, maxUpdatedAt } = await deps.loadState();

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
    fail(`Project.installationId is empty (${project.slug}) — install the app`, "not-installed");
  }

  const formats = [...surfaces].sort((a, b) => compareSurfaces(a.slug, b.slug)).map(surface => {
    const format = formatFromProject(surface, surface.localeCodes);
    if (surface.baseLocale === null) fail("surface base locale is empty");
    return { surface, format, baseLocale: surface.baseLocale, layout: adapterFor(format).layout };
  });
  const client = await deps.createClient(project);

  const baseHead = await client.getRefSha(`heads/${project.baseBranch}`);
  // ⚠️ **`null`을 "브랜치 없음"으로 읽고 진행하지 않는다.** GitHub은 권한 없는 리소스에 404를
  // 주므로 설치 취소·권한 누락도 `null`로 온다. base가 없으면 그 자체로 진행 불가다
  // (`malmoi-i18n/sync`의 `null`만 정상 입력이다 — 첫 실행 경로).
  if (baseHead === null) {
    // ⚠️ **브랜치 부재와 접근 상실이 같은 `null`로 온다** — 코드가 그 둘을 가르지 않는 것이 정직하다.
    fail(
      `cannot read the base branch: ${project.baseBranch} (missing branch, or the app lacks access)`,
      "base-unreadable",
    );
  }

  const tree = await client.getTree(baseHead);
  const resolved = formats.map(item => ({ ...item,
    paths: resolveLocalePaths(item.format, item.layout, tree.map(t => t.path)),
  }));
  const ownership = surfaceOwnership(resolved.map(item => ({
    surfaceId: item.surface.id, surfaceSlug: item.surface.slug, paths: item.paths.map(p => p.path),
  })));
  if (!ownership.ok) fail(ownership.conflicts.map(c => `Surface path conflict: ${c.path} (${c.surfaceSlugs.join(", ")})`).join("; "));
  const paths = resolved.flatMap(item => item.paths);

  // **어댑터 종류와 무관하게 원본을 읽는다.** 두 방식이 원본을 쓰는 이유가 다르다:
  //   - 수술적 치환 — write에 **필수**다. 없으면 치환할 대상이 없어 파일을 안 낸다 (§1.4)
  //   - 재생성 — **표현**(들여쓰기)만 읽는다. 없으면 기본값으로 떨어지고 파일은 그대로 낸다
  //
  // ⚠️ 전에는 `writeStrategy === "surgical"`일 때만 읽어 파일당 blob 1회를 아꼈다. 그 최적화의
  // 대가가 재생성 리포 71개 중 **30개**에서 "값 편집 0건인데 모든 줄이 바뀌는" diff였다
  // (`ARCHITECTURE §1.9` §11.3). 1층(DB 측 스킵)이 편집 없는 날을 이미 걸러내므로, 늘어나는
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

  const rendered = resolved.map(item => ({
    surfaceId: item.surface.id, surfaceSlug: item.surface.slug,
    files: renderLocaleFiles(item.format, item.layout, item.paths, item.surface.keys, item.baseLocale, current),
  }));
  const local = planMultiSurfacePull(rendered);
  const warnings = rendered.flatMap(p => p.files.flatMap(f => (f.errors ?? []).map(e => `${p.surfaceSlug}: ${e.path}: ${adapterErrorMessage(e)}`)));
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
     * 0건이라 커밋을 만들지 않고, 그때 `malmoi-i18n/sync-<slug>`는 **직전 스냅샷 그대로** 남는다. 그 PR을
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
    /**
     * 브랜치 부재는 정상 상태다(첫 실행 전) — 되돌릴 것이 없고, 여기서 만들지도 않는다.
     *
     * ⚠️ **여기서는 `null`을 "부재"로 읽어도 된다.** `getRefSha`의 `null`은 "권한이 없다"일 수도
     * 있어서(GitHub은 접근 불가 리소스에 404를 준다) 그것을 부재로 읽는 것이 오진의 원천이다
     * (POSTMORTEM — base ref를 그렇게 읽으면 `createRef`가 실패할 때까지 오진이 이어진다).
     * 이 줄이 안전한 이유는 **권한 문제라면 이미 위에서 죽었다**는 것뿐이다: base ref 조회가
     * `null`이면 던지고, 그 뒤 트리와 blob을 전부 읽고 나서야 이 지점에 온다. 그 순서가 바뀌면
     * 이 판정도 함께 다시 봐야 한다.
     */
    if (staleHead !== null && staleHead !== baseHead) {
      await client.updateRefForce(deps.syncBranch, baseHead);
    }
    // **커밋이 안 나갔어도 갱신한다** — 그 순간 export == base 트리가 검증된 상태다.
    // 안 하면 값 불변 push 한 번 뒤 매일 밤 트리(그리고 수술적이면 blob 파일 수만큼)를 다시 읽는다.
    // ⚠️ **되돌리기보다 뒤에 쓴다** — 아래 커밋 경로와 같은 순서다. force가 실패했는데 먼저 쓰면
    // 그 편집이 1층에 걸려 다음 실행이 스킵하고, 브랜치는 옛 스냅샷 그대로 남는다.
    // ⚠️ `published`를 넘기지 않는다 — 되돌리기는 "보낸" 것이 아니다 (design §3.4).
    await deps.saveLastPulledAt(project.id, captured);
    return { status: "skipped", reason: "no-changes", ...withWarnings };
  }

  const summary = `${changes.length} file${changes.length === 1 ? "" : "s"}`;
  const treeSha = await client.createTree(buildTreePayload(changes, baseHead));
  const commitSha = await client.createCommit(buildCommitPayload(treeSha, baseHead, summary));

  // 브랜치가 없으면 생성, 있으면 force로 옮긴다. `malmoi-i18n/sync`는 누적 히스토리가 아니라
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
      "malmoi-i18n: sync translations",
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
