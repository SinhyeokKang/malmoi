import { fail } from "@/lib/failure";
import { adapterFor } from "@/lib/adapters";
import { adapterErrorMessage } from "@/lib/i18n/adapter-errors";
import type { GitClient } from "./client";
import { PR_TITLE, buildCommitPayload, buildTreePayload, withSkipMarker } from "./payload";
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
import { planProtectedPublish } from "@/lib/protection/plan";
import { blockingErrors, splitEdits, withheldCoordinates } from "./undeliverable";

/**
 * pull 오케스트레이션. **판정은 전부 `plan.ts`·`payload.ts`·`render.ts`에 있고** 여기는 순서와
 * 의존성 주입만 맡는다. DB와 GitHub이 인자로 들어오므로 fake로 호출 수를 셀 수 있다 —
 * ARCHITECTURE §2의 1층 스킵("편집이 없으면 API 0회")을 판정할 다른 방법이 없다.
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

/** 전달 확인 대상 — Publish 스냅샷에서 읽은 활성 셀의 편집 토큰 (sync-edit-protection — ARCHITECTURE §5의 `pendingEditToken`). 원문은 서버 밖으로 나가지 않는다. */
export type PendingEdit = {
  id: string;
  token: string;
  /**
   * 그 셀의 좌표와 **캡처 시점의 export 값**(translation-rework — ARCHITECTURE §5.8). 캡처 뒤 재편집된 셀의 복원 기준이 이 값이다.
   * 없으면(옛 호출부) 그 셀은 기준을 얻지 못한다 — unknown이라 Revert가 막히는 보수적인 쪽이다.
   */
  cell?: { surfaceId: string; keyId: string; localeCode: string; restoreValue: string };
};

/** 캡처 시점 소스의 context 지문(`lib/translations/context.ts`). 성공 확정이 잠금 뒤 다시 재서 같을 때만 확인을 쓴다. */
export type DeliveryContext = { surfaceId: string; fingerprint: string };

export type PullState = {
  project: PullProject;
  surfaces: (ProjectFormatColumns & { id: string; slug: string; localeCodes: string[]; keys: RenderKey[] })[];
  /** 그 프로젝트 `Translation.updatedAt`의 최대값. 편집이 0건이면 `null`. `lastPulledAt`에 캡처되는 값이다. */
  maxUpdatedAt: Date | null;
  /** 미전달 편집의 수(`pendingWhere`). 1층 스킵의 판정값이다 — `maxUpdatedAt`이 아니다 (T0·T8). */
  unpublished: number;
  /** 같은 스냅샷의 `pendingWhere` 셀. `committed`·`no-changes`에서만 해제 쓰기에 실린다. */
  pendingEdits: readonly PendingEdit[];
  /** 같은 스냅샷의 활성 표면별 context. 없으면 확인할 소스가 없다. */
  deliveryContexts?: readonly DeliveryContext[];
};

export type PullDeps = {
  loadState(): Promise<PullState>;
  createClient(project: PullProject): Promise<GitClient>;
  /**
   * 2층까지 통과했을 때 부른다 — 커밋이 나갔든(성공 후), 변경이 없었든(export == base 트리가 검증된
   * 순간). **실패 경로에서는 부르지 않는다** — 먼저 쓰면 그 편집이 영영 스킵된다 (아래 두 호출 주석).
   */
  saveLastPulledAt(
    projectId: string,
    at: Date,
    published: { prUrl: string } | undefined,
    delivered: readonly PendingEdit[],
    contexts: readonly DeliveryContext[],
    /** 이번 PR에 못 실은 캡처 편집(delivery-invariants D3). 토큰은 남기고, 그 셀의 기준 행 revision만 새 확인으로 다시 찍는다. */
    withheld: readonly PendingEdit[],
  ): Promise<void>;
  /**
   * **첫 외부 쓰기 직전에** 이 프로젝트의 전달 확인을 무효화한다 (ARCHITECTURE §0 불변식 9 · §5.8). 던지면 GitHub에 아무것도 쓰지 않는다.
   * 쓰기 뒤 실패·결과 미확인이면 확인은 무효인 채 남고, 다음 성공 확정만 되살린다.
   * ⚠️ **필수다** (audit #60) — 선택이면 새 호출부가 빠뜨려도 컴파일되고, 그 경로는 GitHub에 쓰면서 옛 확인을 살려 둔다.
   */
  invalidateDelivery(projectId: string): Promise<void>;
  syncBranch: string;
};

/**
 * `warnings`는 writer가 **버린** 항목이다 (`파일: 메시지`) — json-catalog 접두 충돌(ARCHITECTURE §1.35)이 대표다.
 *
 * ⚠️ **경고가 있으면 GitHub에 쓰기 전에 멈춘다** (sync-edit-protection T10, 2026-09-18). 전에는 경고를 커밋·스킵 결과에
 * 실어 보냈다 — 그러면 버린 값의 편집 토큰이 전달 확인으로 비워져 "보내지 않은 편집을 보냈다"가 된다. 그래서 경고는
 * **`writer-warnings` 갈래 하나에만** 산다. 성공(`committed`)·동등(`no-changes`) 결과에 경고 자리가 없다.
 *
 * ⚠️ **단 좌표가 정확한 두 부류는 거부가 아니라 보류다** (delivery-invariants D3, 2026-09-24) — 비-base per-locale 파일 부재와
 * ts-dict 로케일 객체에 자리가 없는 키. 그 셀만 전달 확인에서 빠지고(토큰 유지) 나머지는 나간다. `withheld`는 **경고가 아니라
 * 수**다 — T10이 막은 것은 "버린 값의 토큰을 성공으로 비우는 것"이었고 보류는 토큰을 안 비운다. 사유별로 센다(`file`·`key`) —
 * 결과 문구가 둘을 다르게 말한다. 0이면 필드가 없다.
 */
export type Withheld = { file: number; key: number };
export type PullResult =
  | { status: "skipped"; reason: "no-edits" }
  /**
   * `closedPr` — 이 실행이 닫은 열린 PR (B1 r3). 렌더가 base와 같아 sync 브랜치를 base로 되돌릴 때 그 PR은 할 일이 없다 — 조용히 닫히게 두지 않고
   * 코멘트와 함께 닫은 뒤 결과·Logs(`SyncRun.prUrl`)가 그 사실을 말한다.
   */
  | { status: "skipped"; reason: "no-changes"; withheld?: Withheld; closedPr?: { number: number; url: string } }
  /** 실린 편집 0 + 보류 > 0. 쓰기도 전달 확인도 없다 — 파일 변경이 있었더라도 이 편집들 몫이 아니다. */
  | { status: "skipped"; reason: "withheld"; withheld: Withheld }
  | { status: "skipped"; reason: "writer-warnings"; warnings: string[] }
  | {
      status: "committed";
      /** 전달 확인한 편집 수 — 결과 화면이 말하는 "N changes"다. 미리보기의 미발송 전체와 다르다(보류가 빠진다). */
      delivered: number;
      withheld?: Withheld;
      /**
       * 열린 PR이 있었는지 — 화면 문구가 갈린다("Sent for review" vs "Updated what you sent earlier").
       * `findOpenPr`의 결과로 이미 알고 있던 것을 값으로 안 내고 있었다 (ARCHITECTURE §3).
       */
      pr: "created" | "updated";
      commitSha: string;
      prUrl: string;
      changed: string[];
    };

/**
 * 닫는 PR에 남기는 코멘트. 영문이다 — 대상 리포에 남는 문자열이다(PR title/body와 같은 규칙). 첫 줄의 HTML 주석이 malmoi가 쓴 것임을 표시한다.
 */
export function closedPrComment(baseBranch: string): string {
  return `<!-- malmoi-i18n -->\nClosed by malmoi: the translation DB now matches \`${baseBranch}\`, so this pull request has nothing left to merge.\n\nThe next Publish with changes opens a new pull request.`;
}

/** blob 동시 읽기 수. GitHub 2차 rate limit(동시 요청)을 피하면서 106파일을 60초 안에 든다. */
const BLOB_CONCURRENCY = 8;

export async function runPull(deps: PullDeps): Promise<PullResult> {
  const { project, surfaces, maxUpdatedAt, unpublished, pendingEdits, deliveryContexts = [] } = await deps.loadState();

  // ── 1층: DB 측 스킵. 여기서 끝나면 GitHub을 한 번도 부르지 않는다 ────────────
  if (shouldSkipPull(unpublished)) {
    return { status: "skipped", reason: "no-edits" };
  }
  // 미발송 행이 하나라도 있으면 `Translation` 행이 있으므로 최대값도 있다. 조용한 폴백(`?? new Date(0)`)을
  // 두지 않는다 — 그 값이 DB에 들어가면 1층이 영구히 무력해진다.
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
    surfaceId: item.surface.id, surfaceSlug: item.surface.slug, baseLocale: item.baseLocale,
    files: renderLocaleFiles(item.format, item.layout, item.paths, item.surface.keys, item.baseLocale, current),
  }));
  const local = planMultiSurfacePull(rendered);
  const warnings = blockingErrors(rendered).map(({ surfaceSlug, error }) => `${surfaceSlug}: ${error.path}: ${adapterErrorMessage(error)}`);
  /**
   * ⚠️ **2층 비교·브랜치 되돌림보다 앞이다** — 경고가 있는 렌더는 무엇을 쓰든 값 일부가 빠진 파일이다. 1층을 지났으므로
   * 여기 오면 미전달 편집이 있고, 멈추면 `lastPulledAt`도 토큰도 그대로라 다음 실행이 같은 판정을 다시 한다.
   * ⚠️ **대가: 경고가 지속 상태이면 매 밤 트리·blob을 다시 읽는다** — 사람이 Publish 모달에서 경고를 보고 해소할 때까지다
   * (ARCHITECTURE §3이 감수했다 — `lib/pull/trigger.ts`의 옛 주석이 물리친 정책의 반전이다).
   */
  const decision = planProtectedPublish({ pending: unpublished, writerWarnings: warnings.length });
  if (decision.action === "reject") return { status: "skipped", reason: "writer-warnings", warnings };

  // ⚠️ **보류 셀은 전달 확인에 싣지 않는다** — 불변식 9. `deliveryContexts`는 좁히지 않는다: 좁히면 그 표면의 확인이 무효로 남아
  // 표면 안 모든 키의 Revert가 막힌다(delivery-invariants D3). 1층은 그대로 전체 pending 수라 보류가 남으면 매 실행 트리를 읽는다.
  const keyById = new Map(surfaces.flatMap(surface => surface.keys.flatMap(k => (k.id === undefined ? [] : [[k.id, k.key] as const]))));
  const split = splitEdits(pendingEdits, withheldCoordinates(rendered), keyId => keyById.get(keyId));
  const withheld = split.withheld.length === 0 ? {} : { withheld: split.withheldBy };
  if (split.delivered.length === 0 && split.withheld.length > 0) return { status: "skipped", reason: "withheld", withheld: split.withheldBy };

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
     * 1층 스킵의 "GitHub API 0회"(ARCHITECTURE §2)는 그대로다.
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
    let closedPr: { number: number; url: string } | undefined;
    if (staleHead !== null && staleHead !== baseHead) {
      // 되돌리기도 외부 쓰기다 — 그 결과를 모르는 채 옛 확인으로 복원하지 않게 먼저 무효화한다. 닫기가 첫 외부 쓰기라 그보다도 앞이다.
      await deps.invalidateDelivery(project.id);
      /**
       * ⚠️ **열린 PR을 조용히 닫히게 두지 않는다** (B1 r3 — QA5). head가 base와 같아지면 GitHub이 그 PR을 스스로 닫는다(때로 "merged"로 표시한다).
       * 스냅샷 불변식은 그대로 지키고, **되돌리기 전에** 이유를 남겨 명시적으로 닫는다 — 먼저 되돌리면 자동 종료가 앞서 "merged"가 남을 수 있다.
       * 닫기가 실패하면 되돌리지 않고 던진다 — `lastPulledAt`도 토큰도 그대로라 다음 실행이 같은 판정을 다시 한다.
       */
      const open = await client.findOpenPr(`${project.repoOwner}:${deps.syncBranch}`);
      if (open !== null) {
        await client.closePr(open.number, closedPrComment(project.baseBranch));
        closedPr = { number: open.number, url: open.url };
      }
      await client.updateRefForce(deps.syncBranch, baseHead);
    }
    // **커밋이 안 나갔어도 갱신한다** — 그 순간 export == base 트리가 검증된 상태다.
    // 안 하면 값 불변 push 한 번 뒤 매일 밤 트리(그리고 수술적이면 blob 파일 수만큼)를 다시 읽는다.
    // ⚠️ **되돌리기보다 뒤에 쓴다** — 아래 커밋 경로와 같은 순서다. force가 실패했는데 먼저 쓰면
    // 그 편집이 1층에 걸려 다음 실행이 스킵하고, 브랜치는 옛 스냅샷 그대로 남는다.
    // ⚠️ `published`를 넘기지 않는다 — 되돌리기는 "보낸" 것이 아니다 (ARCHITECTURE §3).
    // ⚠️ **캡처 편집도 여기서 전달 확인한다** — 원복한 편집이 이 경로로 끝나는데 해제하지 않으면 토큰이 영영 남는다
    // (sync-edit-protection — ARCHITECTURE §3의 "유령 pending"). 값을 고르지 않고 no-op을 탐지할 뿐이다.
    await deps.saveLastPulledAt(project.id, captured, undefined, split.delivered, deliveryContexts, split.withheld);
    return { status: "skipped", reason: "no-changes", ...withheld, ...(closedPr === undefined ? {} : { closedPr }) };
  }

  const summary = `${changes.length} file${changes.length === 1 ? "" : "s"}`;
  // ⚠️ **createTree가 첫 외부 쓰기다** — 여기까지는 읽기뿐이라, 무효화가 실패하면 GitHub에 아무것도 남지 않는다.
  await deps.invalidateDelivery(project.id);
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
  const existing = await client.findOpenPr(head);
  let prUrl: string;
  if (existing === null) {
    prUrl = await client.createPr(
      deps.syncBranch,
      project.baseBranch,
      PR_TITLE,
      // 영문이다 — 대상 리포에 남는 문자열이고 CLAUDE.md가 PR title/body를 영문으로 못 박았다.
      `Updated ${summary} from the translation DB.\n\n${changes.map((c) => `- \`${c.path}\``).join("\n")}\n\nThis branch is a snapshot, not a history: it is force-updated on every pull.`,
    );
  } else {
    // 마커가 커밋 메시지에만 있던 시절의 PR — merge commit으로 머지되면 가드가 못 잡는다. 마커만 되돌리고
    // 제목은 두는 것이라(사람이 고친 제목을 덮지 않는다) 결과가 같으면 PATCH도 없다.
    const title = withSkipMarker(existing.title);
    if (title !== existing.title) await client.updatePrTitle(existing.number, title);
    // 설정에서 base를 바꾼 뒤의 PR이다 — 스냅샷 커밋은 이미 새 base 위에 있다 (launch-readiness L3.7).
    if (existing.base !== project.baseBranch) await client.updatePrBase(existing.number, project.baseBranch);
    prUrl = existing.url;
  }

  // 마지막에 쓴다 — 먼저 쓰면 실패한 pull이 다음 실행을 스킵시켜 편집이 영영 안 나간다.
  // **보낸 것의 링크가 새로고침을 넘어야 한다** — cron 경로도 여기를 지나므로 야간 pull이 만든 PR도 남는다.
  await deps.saveLastPulledAt(project.id, captured, { prUrl }, split.delivered, deliveryContexts, split.withheld);

  return {
    status: "committed",
    delivered: split.delivered.length,
    ...withheld,
    pr: existing === null ? "created" : "updated",
    commitSha,
    prUrl,
    changed: changes.map((c) => c.path),
  };
}
