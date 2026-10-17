import { AppError, fail } from "@/lib/failure";
import { adapterFor } from "@/lib/adapters";
import type { AdapterError } from "@/lib/adapters/types";
import type { GitClient, GitTreeEntry } from "./client";
import { PR_TITLE, bodyNeedsRefresh, pullRequestBody, withSkipMarker, type PublishedFile } from "./payload";
import { repoTargetOf, type RepoTarget } from "@/lib/repo-host/target";
import {
  formatFromProject,
  planPullChanges,
  resolveLocalePaths,
  shouldSkipPull,
  type ProjectFormatColumns,
  type PullChange,
} from "./plan";
import { renderLocaleFiles, type RenderKey } from "./render";
import { compareSurfaces, surfaceOwnership } from "@/lib/surfaces/plan";
import { planMultiSurfacePull } from "./surfaces";
import { planProtectedPublish } from "@/lib/protection/plan";
import { publishFingerprint } from "@/lib/publish/fingerprint";
import { countFileChangedValues } from "./changed-values";
import { blockingErrors, keySlot, readSlotFiles, slotlessCells, splitEdits, withheldCoordinates } from "./undeliverable";
import type { LocaleEffect } from "@/lib/locales/effects";
import {
  NO_LOCALE_PLAN, capturedBySurface, deliverableLocaleWork, expiryCheckApplies, hasLocaleRows, localeFingerprintInput, localeNotesOf, localeWorkOf, observedLocalesOf, planProjectLocales,
  type ExpiredLocaleRequest, type LocaleNotes, type LocaleRefusalSite, type ProjectLocalePlan, type SurfaceLocaleChanges,
} from "./locales";

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
  repoHost: string;
  installationId: string | null;
  repositoryId: string | null;
  gitlabConnectionId: string | null;
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
  surfaces: (ProjectFormatColumns & {
    id: string; slug: string; localeCodes: string[]; keys: RenderKey[];
    /**
     * 같은 스냅샷의 언어 변경 상태(locale-add design §1). 행도 전달 목록도 없는 소스는 없다 — 그 소스는 기존 Publish 그대로다.
     * ⚠️ 운영 로더(`load.ts`)는 늘 채운다 — 빠뜨리면 REMOVE가 렌더에 남아 삭제 대신 파일이 다시 쓰인다(`locale-publish.integration.ts`가 진입점부터 잰다).
     */
    localeChanges?: SurfaceLocaleChanges;
  })[];
  /** 그 프로젝트 `Translation.updatedAt`의 최대값. `Translation` 행이 0건이면 `null`. `lastPulledAt`에 캡처되는 값이다. */
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
  /** 1층·연결 판정을 지난 뒤에만 부른다 — 입력은 `repoTargetOf(project)`다(호스트 구현을 고르는 것은 `lib/repo-host`). */
  createClient(target: RepoTarget): Promise<GitClient>;
  /**
   * 2층까지 통과했을 때 부른다 — 커밋이 나갔든(성공 후), 변경이 없었든(export == base 트리가 검증된
   * 순간). **실패 경로에서는 부르지 않는다** — 먼저 쓰면 그 편집이 영영 스킵된다 (아래 두 호출 주석).
   */
  saveLastPulledAt(
    projectId: string,
    /** `null`이면 `lastPulledAt`을 건드리지 않는다 — 셀 확인이 없는 언어 변경만의 실행이다(`maxUpdatedAt=null`, design §4). */
    at: Date | null,
    published: { prUrl: string } | undefined,
    delivered: readonly PendingEdit[],
    contexts: readonly DeliveryContext[],
    /** 이번 PR에 못 실은 캡처 편집(delivery-invariants D3). 토큰은 남기고, 그 셀의 기준 행 revision만 새 확인으로 다시 찍는다. */
    withheld: readonly PendingEdit[],
    /** 소스별 캡처 효과 목록 — 확인 tx가 그 소스의 `deliveredLocaleChanges`로 쓴다(locale-add design §1). 셀 전달 확인과 따로 싣는다. */
    locales: ReadonlyMap<string, readonly LocaleEffect[]>,
  ): Promise<void>;
  /**
   * **첫 외부 쓰기 직전에** 이 프로젝트의 전달 확인을 무효화한다 (ARCHITECTURE §0 불변식 9 · §5.8). 던지면 GitHub에 아무것도 쓰지 않는다.
   * 쓰기 뒤 실패·결과 미확인이면 확인은 무효인 채 남고, 다음 성공 확정만 되살린다.
   * ⚠️ **필수다** (audit #60) — 선택이면 새 호출부가 빠뜨려도 컴파일되고, 그 경로는 GitHub에 쓰면서 옛 확인을 살려 둔다.
   */
  invalidateDelivery(
    projectId: string,
    /** 캡처한 소스 — 확인 행이 아직 없는 소스는 무효화된 행으로 만든다(review-B1b Y5). 첫 Publish가 미확인으로 끝나도 "확인 안 됨"으로 읽힌다. */
    surfaceIds: readonly string[],
  ): Promise<void>;
  /**
   * 보류된 셀 **전부에** 되돌릴 기준(`TranslationBaseline`)이 있는가 (#129). 결과의 OWNER 안내가 `Revert to last sent`를 가리키는 조건이다 — 기준이 없는
   * 셀의 Revert는 꺼져 있다("The last sent version isn't available…"). 선택이다: 없거나 false면 안내가 Revert를 말하지 않는다(모르는 것을 약속하지 않는다).
   */
  withheldRevertable?(projectId: string, withheld: readonly PendingEdit[]): Promise<boolean>;
  /**
   * **스냅샷 전 언어 변경 만료** (locale-add design §1 "모든 Publish가 스냅샷 전에 같은 판정을 지난다"). 행이 있는 프로젝트에서만, 열린 PR 조회와
   * base 관측 **뒤에** 부른다. 반환은 만료한 요청 — 비지 않으면 `runPull`이 스냅샷을 다시 읽고, 보낼 것이 없으면 결과(`expired`)가 그것을 말한다(#267).
   * ⚠️ **운영 조립(`triggerPull`)은 cron까지 늘 넘긴다** (R-B2 R1) — 선택인 것은 오케스트레이션 단위 테스트의 픽스처 때문이다. 빠지면 닫힌 요청이 다시 실린다.
   * ⚠️ 구현은 `Project` 잠금을 쥔 tx 안에서 `expireLocaleChanges`를 부른다(W3 — 사람 경로는 `lockProjectAccess`, cron은 AUTOMATION).
   */
  expireLocales?(input: {
    projectId: string;
    pullRequest: "none-open" | "open";
    surfaces: { surfaceId: string; surfaceSlug: string; observed: ReturnType<typeof observedLocalesOf> }[];
  }): Promise<ExpiredLocaleRequest[]>;
  syncBranch: string;
};

/**
 * writer가 **버린** 항목 하나 — 문장이 아니라 **코드**다(ui-locales B1′). 이 결과는 Publish 모달·cron JSON·MCP 응답·서버 로그로 가는데
 * 누구의 언어로 쓸지는 받는 쪽만 안다 — 화면은 그 사용자의 사전으로, cron·MCP는 en으로 조립한다(`lib/i18n/adapter-errors.ts`).
 * ⚠️ **그래서 `lib/pull/**`는 사전을 import하지 않는다**(`lib/i18n/__tests__/dictionary-consistency.test.ts`가 소스로 센다).
 */
export type PullWarning = { surfaceSlug: string } & AdapterError;

/**
 * `warnings`는 writer가 **버린** 항목이다 (`PullWarning` — 표면·파일·코드) — json-catalog 접두 충돌(ARCHITECTURE §1.35)이 대표다.
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
export type Withheld = {
  file: number;
  key: number;
  /** `file` 중 언어 변경 계획이 뺀 언어(보류된 ADD 등)의 편집 수 — 있을 때만. 결과 화면이 파일 복구 권유에서 뺀다(R-E3 Y1). `SyncRun.withheld`는 그대로 `file + key`다. */
  language?: number;
  /** 보류 셀 전부가 Revert로 풀린다(#129 — `withheldRevertable`). 그럴 때만 있다 — 없으면 안내가 Revert를 가리키지 않는다. `SyncRun.withheld`(수)에는 안 실린다. */
  revertable?: true;
};
export type PullResult =
  /**
   * `locales` — 셀 편집 0인데 언어 작업이 전부 보류(경로가 이미 있는 ADD)일 때만 있다. 그때도 쓰기는 0이다.
   * `expired` — 이 실행이 스냅샷 전에 정리한 언어 요청(PR/MR이 더 이상 열려 있지 않다, #267). 보낼 것이 없어 끝났을 때만 있다. 요청마다 `presence`가
   * 리포가 요청대로였는지(머지)·아닌지(리포에 닿지 못한 채 닫힘)를 가른다(`reachedRepository`) — 뒤엣것이 있으면 "리포에 이미 있다"가 거짓이다.
   */
  | { status: "skipped"; reason: "no-edits"; locales?: LocaleNotes; expired?: ExpiredLocaleRequest[] }
  /**
   * `closedPr` — 이 실행이 닫은 열린 PR (B1 r3). 렌더가 base와 같아 sync 브랜치를 base로 되돌릴 때 그 PR은 할 일이 없다 — 조용히 닫히게 두지 않고
   * 코멘트와 함께 닫은 뒤 결과·Logs(`SyncRun.prUrl`)가 그 사실을 말한다.
   */
  | { status: "skipped"; reason: "no-changes"; withheld?: Withheld; closedPr?: { number: number; url: string }; locales?: LocaleNotes }
  /** 실린 편집 0 + 보류 > 0 + 언어 작업 0. 쓰기도 전달 확인도 없다 — 파일 변경이 있었더라도 이 편집들 몫이 아니다. */
  | { status: "skipped"; reason: "withheld"; withheld: Withheld; locales?: LocaleNotes }
  | { status: "skipped"; reason: "writer-warnings"; warnings: PullWarning[] }
  /**
   * 미리보기가 준 지문(`expectedFingerprint`)과 실행권 뒤 스냅샷 + base head의 지문이 다르다 (mcp-connector design §3.1). **첫 쓰기 전에** 끝나
   * GitHub 쓰기·전달 확인 무효화·성공 확정이 전부 0이다. 인자가 없는 호출(웹·cron)에는 생기지 않는다.
   */
  | { status: "skipped"; reason: "reconfirm" }
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
      /**
       * 바뀐 파일과 그 종류(`new`·`updated`·`removed`) — 데이터만이다(locale-add O5, 화면 표시는 시안 배치). `changed`와 같은 순서다.
       * `runPull`은 늘 싣는다. 선택인 것은 결과를 손으로 만드는 소비자(문구·로그 판정)가 아직 이 필드를 읽지 않아서다.
       */
      files?: PublishedFile[];
      /** 언어 보류 안내 — 경로가 이미 있는 ADD·값 0개 ADD. 없으면 필드가 없다. */
      locales?: LocaleNotes;
      /**
       * 바뀐 파일들에서 바뀐 번역 엔트리 수(수정 + 추가) — `SyncRun.changedValues` (`changed-values.ts`). 열린 PR을 갱신했으면 PR 전체 vs base다.
       * ⚠️ 관측값이다 — 이 실행의 어떤 판정에도 들어가지 않는다. 집계가 던지면 `null`이다(관측 실패 — 커밋은 그대로 성공이다).
       */
      changedValues: number | null;
    };

/**
 * 닫는 PR에 남기는 코멘트. 영문이다 — 대상 리포에 남는 문자열이다(PR title/body와 같은 규칙). 첫 줄의 HTML 주석이 malmoi가 쓴 것임을 표시한다.
 * ⚠️ **낱말은 호스트가 고른다**(audit U3) — GitLab MR 화면에 "pull request"가 남으면 DESIGN §10.1 리포 호스트 행과 어긋난다. 모르는 호스트는
 * 클라이언트를 만들지 못해(`repoTargetOf` → `not-connected`) 여기 오지 않으므로 GitLab이 아니면 GitHub 낱말이다.
 */
export function closedPrComment(baseBranch: string, repoHost: string): string {
  const noun = repoHost === "gitlab" ? "merge request" : "pull request";
  return `<!-- malmoi-i18n -->\nClosed by Malmoi: the translation DB now matches \`${baseBranch}\`, so this ${noun} has nothing left to merge.\n\nThe next Publish with changes opens a new ${noun}.`;
}

/** blob 동시 읽기 수. GitHub 2차 rate limit(동시 요청)을 피하면서 106파일을 60초 안에 든다. */
const BLOB_CONCURRENCY = 8;

/**
 * **실행의 읽기 단계** — base head·트리·원본 blob·렌더·2층 blob 비교까지. GitHub에 쓰지 않는다. `runPull`과 Publish 미리보기(`lib/publish/read.ts`)가
 * **같은 함수로** "PR이 바꾸는 파일"을 얻는다(#128) — 미리보기가 편집 셀만 세면 orphan 제거·앞선 PR의 재전송처럼 토큰 없이 바뀌는 파일이 화면에서 빠진다.
 */
export type ProjectFormats = ReturnType<typeof projectFormats>;

/** 표면별 포맷. GitHub을 부르기 전에 판정한다 — 설정 오류로 토큰을 발급받지 않는다. */
export function projectFormats(surfaces: PullState["surfaces"]) {
  return [...surfaces].sort((a, b) => compareSurfaces(a.slug, b.slug)).map(surface => {
    const format = formatFromProject(surface, surface.localeCodes);
    if (surface.baseLocale === null) fail("surface base locale is empty");
    return { surface, format, baseLocale: surface.baseLocale, layout: adapterFor(format).layout };
  });
}

/** 미리보기만 파일 종류 거부를 복구 안내로 옮긴다. 실행의 AppError 이름·메시지·실패 계약은 유지한다. */
export class GitFileKindError extends AppError {
  constructor(readonly path: string, readonly mode: string, readonly branch: string) {
    super(`unsupported Git file mode at ${path}: ${mode}`);
  }
}

/**
 * **결정적인 언어 계획 거부** (locale-add R-B2 Y2 — POSTMORTEM 2026-10-07 #200 계열) — 경로 충돌·중복·안전하지 않은 경로. 소스 설정을 고쳐야 풀리므로
 * 실행은 재시도 불가 코드(`locale-plan-refused`)로, 미리보기는 같은 코드의 `refused`로 끝난다 — "다시 시도"로 안내하지 않는다.
 * `path`는 소스 설정에서 계산한 경로라 화면에 실어도 된다(안전하지 않은 경로는 계산하지 못해 비어 있다).
 */
export class LocalePlanRefused extends AppError {
  /** @param site 거부한 소스·언어·경로를 쥔 소스(시안 P1 ⑥ — 화면이 고칠 자리를 말한다). 모르면 `null`. */
  constructor(readonly refusal: "path-conflict" | "duplicate-path" | "unsafe-path", readonly path: string, readonly branch: string, readonly site: LocaleRefusalSite | null = null) {
    super(`locale change cannot be published: ${refusal}${path === "" ? "" : ` (${path})`}`, "locale-plan-refused");
  }
}

/**
 * @param read 이미 읽은 base head·트리 — 미리보기가 셀 조회에 쓴 것을 넘긴다(#128 r5). 다시 읽으면 한 번 열 때 ref·트리를 두 번 부르고, 셀과 파일 목록이
 *   서로 다른 head를 볼 수 있다.
 */
export async function renderProject(
  project: Pick<PullProject, "slug" | "baseBranch">,
  formats: ProjectFormats,
  client: Pick<GitClient, "getRefSha" | "getTree" | "getBlobText">,
  /** 트리를 빼면 `baseHead`만 쓰고 트리는 여기서 읽는다 — 지문 대조가 head만 먼저 읽는 경로(`runPull`)다. */
  read?: { baseHead: string; tree?: Awaited<ReturnType<GitClient["getTree"]>> },
  /**
   * 언어 변경 계획(`planProjectLocales` — 같은 트리로 계산한 것). 제외 언어는 렌더하지 않고, 삭제 경로는 아래 파일 종류 가드를 지나 base에 있는 것만
   * delete가 되며(`planPullChanges`), 생성 언어는 기준 언어 파일의 표현을 빌린다. 없으면 기존 렌더 그대로다.
   */
  locales: ProjectLocalePlan = NO_LOCALE_PLAN,
) {
  assertLocalePlanOwned(formats, locales);
  const baseHead = read?.baseHead ?? await readBaseHead(project, client);
  const tree = read?.tree ?? await client.getTree(baseHead);
  const planBySurface = new Map(locales.surfaces.map(plan => [plan.surfaceId, plan]));
  const resolved = formats.map(item => {
    const skip = new Set(planBySurface.get(item.surface.id)?.exclude ?? []);
    const format = skip.size === 0 ? item.format : { ...item.format, locales: item.format.locales.filter(code => !skip.has(code)) };
    return { ...item, format, paths: resolveLocalePaths(format, item.layout, tree.map(t => t.path)) };
  });
  const deletes = locales.surfaces.flatMap(plan => plan.deletes.map(d => d.path));
  const ownership = surfaceOwnership(resolved.map(item => ({
    surfaceId: item.surface.id, surfaceSlug: item.surface.slug, paths: item.paths.map(p => p.path),
  })));
  if (!ownership.ok) fail(ownership.conflicts.map(c => `Surface path conflict: ${c.path} (${c.surfaceSlugs.join(", ")})`).join("; "));
  const paths = resolved.flatMap(item => item.paths);
  // 원본 blob 읽기·렌더보다 먼저 파일 종류를 확인한다. 링크를 파싱 실패/파일 부재로 접으면 재생성 writer가 덮어쓴다.
  const entryByPath = new Map(tree.map(entry => [entry.path, entry]));
  // ⚠️ 삭제 경로도 같은 문을 지난다 — 링크·서브모듈을 지우거나 링크 아래 경로를 지우는 계획을 쓰기 전에 막는다.
  for (const path of [...paths.map(p => p.path), ...deletes]) {
    const entry = entryByPath.get(path);
    if (entry !== undefined && entry.mode !== "100644" && entry.mode !== "100755") {
      throw new GitFileKindError(path, entry.mode, project.baseBranch);
    }
    // 디렉터리 링크·gitlink 아래의 새 경로를 만드는 우회도 막는다. 실제 tree 조상만 허용한다.
    const parts = path.split("/");
    for (let depth = 1; depth < parts.length; depth++) {
      const ancestor = entryByPath.get(parts.slice(0, depth).join("/"));
      if (ancestor !== undefined && ancestor.mode !== "040000") {
        throw new GitFileKindError(ancestor.path, ancestor.mode, project.baseBranch);
      }
    }
  }

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

  const rendered = resolved.map(item => {
    const creates = new Set(planBySurface.get(item.surface.id)?.creates.map(c => c.localeCode) ?? []);
    const basePath = item.paths.find(p => p.locale === item.baseLocale)?.path;
    // 새 언어 파일의 표현 출처는 **그 소스의 기준 언어 파일 하나**다(design §4) — 형제 파일 중 아무것이나 고르지 않는다.
    const represent = creates.size === 0 ? undefined : { locales: creates, source: basePath === undefined ? undefined : current.get(basePath) };
    return {
      surfaceId: item.surface.id, surfaceSlug: item.surface.slug, baseLocale: item.baseLocale,
      files: renderLocaleFiles(item.format, item.layout, item.paths, item.surface.keys, item.baseLocale, current, represent),
    };
  });
  const local = planMultiSurfacePull(rendered);
  const changes = planPullChanges(local, tree.map((t) => ({ path: t.path, sha: t.sha })), deletes);
  return { baseHead, tree, resolved, current, rendered, local, changes, locales };
}

/**
 * **삭제·생성 계획은 그 소스의 REMOVE·ADD 행에서만 온다** (review-A2 F2). 계획의 경로가 행의 경로(템플릿 치환)와 다르거나 행이 없는 언어면 렌더 전에
 * 던진다 — 렌더 결과에서 빠졌다는 이유로, 또는 다른 의도의 경로로 리포 파일을 지우는 길을 경계 하나로 막는다.
 */
function assertLocalePlanOwned(formats: ProjectFormats, plan: ProjectLocalePlan): void {
  for (const surface of plan.surfaces) {
    const item = formats.find(format => format.surface.id === surface.surfaceId);
    const rows = item?.surface.localeChanges?.rows ?? [];
    const owned = (operation: "ADD" | "REMOVE") => ({ localeCode, path }: { localeCode: string; path: string }) =>
      rows.some(row => row.localeCode === localeCode && row.operation === operation) && item?.surface.pathTemplate?.replaceAll("{locale}", localeCode) === path;
    if (!surface.deletes.every(owned("REMOVE")) || !surface.creates.every(owned("ADD"))) {
      fail(`unreachable: locale plan outside REMOVE/ADD rows (${surface.surfaceSlug})`);
    }
  }
}

/**
 * 같은 트리로 언어 변경 계획을 세운다 — 실행과 미리보기가 같은 거부를 낸다. 비정규 파일 삭제는 기존 파일 종류 거부(`GitFileKindError`)로 접고, 그 밖의
 * 거부(경로 충돌·안전하지 않은 경로)는 Publish 실패다. 행이 없으면 트리를 보지 않는다.
 */
export function planLocales(project: Pick<PullProject, "baseBranch">, formats: ProjectFormats, tree: readonly GitTreeEntry[]): ProjectLocalePlan {
  const planned = planProjectLocales(formats, tree);
  if (planned.ok) return planned.plan;
  if ("mode" in planned) throw new GitFileKindError(planned.path, planned.mode, project.baseBranch);
  // 트리를 읽은 뒤의 계획이라 `base-unreadable`은 오지 않는다 — 와도 부재로 접지 않고 실패다.
  if (planned.error === "base-unreadable") fail("unreachable: locale plan saw an unreadable base after reading the tree");
  if (planned.error === "irregular-file") fail("unreachable: irregular locale file without a mode");
  throw new LocalePlanRefused(planned.error, "path" in planned ? planned.path : "", project.baseBranch, planned.site ?? null);
}

/** 미리보기와 실행이 같은 원본 자리·스냅샷으로 전달 가능 셀과 빈값 경고를 판정한다. */
export function planDelivery(
  pendingEdits: readonly PendingEdit[],
  { resolved, current, rendered, locales = NO_LOCALE_PLAN }: Pick<Awaited<ReturnType<typeof renderProject>>, "resolved" | "current" | "rendered"> & { locales?: ProjectLocalePlan },
) {
  // ⚠️ **보류 셀은 전달 확인에 싣지 않는다** — 불변식 9. `deliveryContexts`는 좁히지 않는다: 좁히면 그 표면의 확인이 무효로 남아
  // 표면 안 모든 키의 Revert가 막힌다(delivery-invariants D3). 1층은 그대로 전체 pending 수라 보류가 남으면 매 실행 트리를 읽는다.
  const keyById = new Map(resolved.flatMap(({ surface }) => surface.keys.flatMap(k => (k.id === undefined ? [] : [[k.id, k.key] as const]))));
  const coordinates = withheldCoordinates(rendered);
  // 렌더에서 뺀 언어(REMOVE · 경로가 이미 있는 ADD · 값 0개 ADD)의 편집은 파일에 닿지 않는다 — 언어 통째로 보류한다(토큰 유지, design §4).
  coordinates.languages = new Set();
  for (const plan of locales.surfaces) for (const code of plan.exclude) {
    coordinates.locales.add(`${plan.surfaceId}\0${code}`);
    coordinates.languages.add(`${plan.surfaceId}\0${code}`);
  }
  // ⚠️ **키 자리가 원본에 없는 셀은 보류다** — 미리보기(`publish/read.ts`)가 같은 `keySlot`으로 판정한다. 원본만 읽는다 — 이 셀들의 자리는 렌더가 만들지 않는다.
  //   - ts-dict(multi-locale 수술적): 표면의 어느 파일에도 자리가 없다(audit #1 B). writer는 삽입하지 않고 같은 파일의 다른 로케일이 가질 때만 경고한다
  //   - per-locale: **base 파일**에 자리가 없다(B3.4). base의 키 집합은 원본이 정하므로 코드가 지운 키의 base 편집은 파일에 닿지 않는다.
  //     base 파일만 읽는다 — `keySlot`이 그 밖의 로케일을 `no-locale`로 흘려 비-base 동작이 그대로다
  for (const item of resolved) {
    const adapter = adapterFor(item.format);
    const multi = adapter.layout === "multi-locale";
    if (multi && adapter.writeStrategy !== "surgical") continue;
    const scope = multi ? item.paths : item.paths.filter(p => p.locale === item.baseLocale);
    const files = readSlotFiles(adapter, item.format, scope.flatMap(p => {
      const content = current.get(p.path);
      return content === undefined ? [] : [{ path: p.path, content }];
    }));
    for (const cell of slotlessCells(item.surface.id, files, pendingEdits, keyId => keyById.get(keyId))) coordinates.cells.add(cell);
  }
  const split = splitEdits(pendingEdits, coordinates, keyId => keyById.get(keyId));
  const warnings: PullWarning[] = [];
  const slots = new Map<string, ReturnType<typeof readSlotFiles>>();
  for (const edit of split.delivered) {
    const cell = edit.cell;
    if (cell === undefined) continue;
    const item = resolved.find(item => item.surface.id === cell.surfaceId);
    if (item === undefined) continue;
    const adapter = adapterFor(item.format);
    if (adapter.writeStrategy !== "surgical") continue;
    const key = item.surface.keys.find(key => key.id === cell.keyId);
    if (key === undefined || !Object.hasOwn(key.cells, cell.localeCode) || key.cells[cell.localeCode]?.value !== ""
      || (cell.localeCode === item.baseLocale && key.sourceText !== "")) continue;
    let files = slots.get(item.surface.id);
    if (files === undefined) {
      files = readSlotFiles(adapter, item.format, item.paths.flatMap(p => {
        const content = current.get(p.path);
        return content === undefined ? [] : [{ path: p.path, content }];
      }));
      slots.set(item.surface.id, files);
    }
    const slot = keySlot(files, cell.localeCode, key.key);
    const paths = adapter.layout === "per-locale" ? item.paths.filter(p => p.locale === cell.localeCode).map(p => p.path)
      : slot.kind === "slot" ? slot.paths : [];
    for (const path of paths) warnings.push({ surfaceSlug: item.surface.slug, path, key: key.key, code: "write-empty-unsupported" });
  }
  return { split, warnings };
}

async function readBaseHead(project: Pick<PullProject, "baseBranch">, client: Pick<GitClient, "getRefSha">): Promise<string> {
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
  return baseHead;
}

/**
 * @param expectedFingerprint `preview_publish`가 준 지문 (mcp-connector design §3.1). 주면 `loadState()`와 base head를 읽은 직후·첫 GitHub 쓰기 전에
 *   같은 입력의 `publishFingerprint`와 대조하고, 다르면 `reconfirm`이다. **안 주면 대조가 없다** — 웹·cron 경로는 그대로다.
 */
export async function runPull(deps: PullDeps, expectedFingerprint?: string): Promise<PullResult> {
  let state = await deps.loadState();
  const { project } = state;

  // ── 1층: DB 측 스킵. 여기서 끝나면 GitHub을 한 번도 부르지 않는다 ────────────
  // 셀 편집 0 **그리고** 언어 변경 작업 0일 때만이다 — 셀 편집 없이 보낼 삭제·새 파일이 있을 수 있다(locale-add design §4 조기 종료 ①).
  // ⚠️ **스냅샷 전 만료가 돌아야 하면 1층보다 먼저다** (#267) — 전달된 제거의 PR/MR이 머지 없이 닫힌 창은 작업이 0이라, 여기서 끝나면 "모든 Publish가
  // 스냅샷 전에 만료한다"(R4)가 깨지고 결과가 "리포에 이미 있다"는 거짓을 말한다. 대가는 전달된 언어 변경이 PR/MR에 실려 있는 동안 편집 없는 Publish도
  // 리포 호스트를 부른다는 것이다(head·열린 PR·트리). 전달된 효과가 없는 행은 그대로 원격 0회다(`expiryCheckApplies`).
  const expiryApplies = deps.expireLocales !== undefined && expiryCheckApplies(state.unpublished, state.surfaces);
  if (!expiryApplies && shouldSkipPull(state.unpublished, localeWorkOf(state.surfaces))) {
    return { status: "skipped", reason: "no-edits" };
  }

  // 리포 호스트를 부르기 전에 막는다 — 연결이 없으면 조용히 빈 PR을 내는 대신 즉시 알린다. 저장 코드는 둘 다 `not-installed`다
  // ("그 프로젝트에 쓸 연결 자격증명이 없음" — `SYNC_ERROR_CODES`). 클라이언트 생성(첫 원격 호출)은 이 판정 **뒤**다.
  const connection = repoTargetOf(project);
  if (connection.status === "not-connected") {
    fail(`Project.installationId is empty (${project.slug}) — install the app`, "not-installed");
  }
  // GitLab 연결 참조 비움(`connection-removed`, D21)도 재연결이 고친다 — 같은 코드·같은 자리.
  if (connection.status === "unpinned" || connection.status === "connection-removed") fail("repository identity is not pinned; reconnect the project", "not-installed");

  let formats = projectFormats(state.surfaces);
  const client = await deps.createClient(connection.target);
  /**
   * ⚠️ **head는 한 번 읽어 끝까지 쓴다** — 지문 대조·만료 관측·렌더·커밋의 부모가 같은 head여야 한다. 지문 대조는 트리·blob을 읽기 전이라
   * reconfirm이 읽기도 최소다(언어 변경 행이 없으면). 1층(no-edits)보다 뒤인 것은 의도다: 보낼 것이 없으면 지문과 무관하게 GitHub 0회로 끝난다 — 단 스냅샷 전 만료가 돌아야 하는 프로젝트
   * (`expiryCheckApplies` — 전달된 언어 변경이 있고 그 PR/MR이 열렸는지 모른다)는 1층 앞에서 여기까지 온다(#267). 그때도 만료 뒤 보낼 것이 없으면 지문 전에 끝난다.
   */
  const baseHead = await readBaseHead(project, client);
  let tree: GitTreeEntry[] | undefined;
  const readTree = async () => (tree ??= await client.getTree(baseHead));

  /**
   * ⚠️ **스냅샷 전 만료** (locale-add design §1) — 머지 없이 닫힌 PR의 요청이 남아 있으면 REMOVE가 매 스냅샷 다시 실려 **종료된 요청을 재전송한다.**
   * 열린 PR 조회가 실패하면 그대로 던진다(fail-closed) — "PR 없음"으로 읽고 만료하면 아직 열린 PR의 삭제가 빠진다. 만료가 있었으면 스냅샷을 다시
   * 읽는다 — 만료 전 스냅샷의 의도를 싣지 않는다. MCP 미리보기의 지문은 만료 전 상태라 그때 reconfirm이다(안전한 쪽).
   */
  let expiredRequests: ExpiredLocaleRequest[] = [];
  if (deps.expireLocales !== undefined && expiryApplies) {
    const open = await client.findOpenPr(deps.syncBranch);
    const entries = await readTree();
    const expired = await deps.expireLocales({
      projectId: project.id,
      pullRequest: open === null ? "none-open" : "open",
      surfaces: formats.filter(item => (item.surface.localeChanges?.rows.length ?? 0) > 0)
        .map(item => ({ surfaceId: item.surface.id, surfaceSlug: item.surface.slug, observed: observedLocalesOf(item, entries) })),
    });
    if (expired.length > 0) {
      expiredRequests = expired;
      state = await deps.loadState();
      // 지문 대조보다 앞이다 — 쓸 것이 없으므로 승인할 것도 없다. 미리보기가 같은 판정으로 "버려진다"고 말했다(`expiringLocalesOf`).
      if (shouldSkipPull(state.unpublished, localeWorkOf(state.surfaces))) return { status: "skipped", reason: "no-edits", expired };
      formats = projectFormats(state.surfaces);
    }
  }

  const { surfaces, maxUpdatedAt, unpublished, pendingEdits, deliveryContexts = [] } = state;
  // 미발송 행이 하나라도 있으면 `Translation` 행이 있으므로 최대값도 있다. 조용한 폴백(`?? new Date(0)`)을
  // 두지 않는다 — 그 값이 DB에 들어가면 1층이 영구히 무력해진다. 셀 편집 없이 언어 작업만 있으면 `null`이 정상이다 —
  // 그때는 셀 확인이 없으므로 `lastPulledAt`을 건드리지 않는다(언어 목록 확인과 셀 확인을 가른다, design §4).
  if (unpublished > 0 && maxUpdatedAt === null) fail("unreachable: passed the layer-1 check but maxUpdatedAt is null");
  // 이 값이 `lastPulledAt`에 들어간다 — `now()`를 쓰면 export 스냅샷과 갱신 사이에 들어온
  // 편집이 다음 실행에서 영영 스킵된다.
  const captured = maxUpdatedAt;

  const localePlan = hasLocaleRows(surfaces) ? planLocales(project, formats, await readTree()) : NO_LOCALE_PLAN;
  /**
   * 1층 뒤의 판정은 **이 스냅샷이 보낼 수 있는** 언어 작업으로 한다(R-B2 Y1). 1층의 `localeWorkOf`는 보류된 ADD도 작업으로 세서(그래야 계획을 세운다)
   * 그대로 쓰면 보류 ADD 하나가 매 Publish를 쓰기·PR 닫기까지 끌고 간다.
   */
  const localeWork = deliverableLocaleWork(localePlan, surfaces);
  const localeNotesEarly = localeNotesOf(localePlan);
  if (unpublished === 0 && localeWork === 0) {
    return { status: "skipped", reason: "no-edits", ...(localeNotesEarly === undefined ? {} : { locales: localeNotesEarly }), ...(expiredRequests.length === 0 ? {} : { expired: expiredRequests }) };
  }
  if (expectedFingerprint !== undefined) {
    // 행이 있을 때만 base 입력(대상 blob·삭제 경로)이 선다 — 없으면 트리를 읽기 전에 대조한다.
    const locale = tree === undefined ? undefined : localeFingerprintInput(localePlan, formats, tree);
    if (publishFingerprint(state, baseHead, locale) !== expectedFingerprint) return { status: "skipped", reason: "reconfirm" };
  }
  const read = tree === undefined ? { baseHead } : { baseHead, tree };
  const { tree: baseTree, resolved, current, rendered, changes } = await renderProject(project, formats, client, read, localePlan);
  // 렌더의 로케일 좌표(`locale`)는 싣지 않는다 — 결과의 계약은 표면·파일·코드(+키·파서 원문)다.
  const warnings = blockingErrors(rendered).map(({ surfaceSlug, error: { path, code, key, detail } }): PullWarning => (
    { surfaceSlug, path, code, ...(key === undefined ? {} : { key }), ...(detail === undefined ? {} : { detail }) }
  ));
  /**
   * ⚠️ **2층 비교·브랜치 되돌림보다 앞이다** — 경고가 있는 렌더는 무엇을 쓰든 값 일부가 빠진 파일이다. 1층을 지났으므로
   * 여기 오면 미전달 편집이 있고, 멈추면 `lastPulledAt`도 토큰도 그대로라 다음 실행이 같은 판정을 다시 한다.
   * ⚠️ **대가: 경고가 지속 상태이면 매 밤 트리·blob을 다시 읽는다** — 사람이 Publish 모달에서 경고를 보고 해소할 때까지다
   * (ARCHITECTURE §3이 감수했다 — `lib/pull/trigger.ts`의 옛 주석이 물리친 정책의 반전이다).
   */
  const { split, warnings: emptyWarnings } = planDelivery(pendingEdits, { resolved, current, rendered, locales: localePlan });
  warnings.push(...emptyWarnings);
  // 셀 편집과 언어 작업을 합친 "보낼 일"이다 — 셀 0·언어 작업 > 0에서도 경고 거부가 서야 한다(design §4 판정표).
  const decision = planProtectedPublish({ pending: unpublished + localeWork, writerWarnings: warnings.length });
  if (decision.action === "reject") return { status: "skipped", reason: "writer-warnings", warnings };

  // 기준의 유무는 이 실행의 확정과 무관하다 — 보류 셀은 토큰을 지키고 기준 행의 revision만 다시 찍힌다(`saveLastPulledAt`). 그래서 쓰기 전에 묻는다.
  const revertable = split.withheld.length > 0 && deps.withheldRevertable !== undefined && await deps.withheldRevertable(project.id, split.withheld);
  const withheldBy: Withheld = revertable ? { ...split.withheldBy, revertable: true } : split.withheldBy;
  const withheld = split.withheld.length === 0 ? {} : { withheld: withheldBy };
  const notes = localeNotesEarly;
  const localeNotes = notes === undefined ? {} : { locales: notes };
  // 셀이 전부 보류여도 언어 작업이 있으면 진행한다 — 안전한 삭제·새 파일은 전달할 수 있다(design §4 조기 종료 ②).
  if (split.delivered.length === 0 && split.withheld.length > 0 && localeWork === 0) return { status: "skipped", reason: "withheld", withheld: withheldBy, ...localeNotes };
  const contextIds = deliveryContexts.map(context => context.surfaceId);
  // 스냅샷 때의 효과 목록이다 — 확인 tx는 이 캡처를 쓰고, 실행 중의 새 요청·취소는 확인 뒤에도 작업으로 남는다(design §3 "Publish 경합").
  const deliveredLocales = capturedBySurface(localePlan, contextIds);

  // ── 2층: blob SHA 비교 ──────────────────────────────────────────────────────
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
      await deps.invalidateDelivery(project.id, contextIds);
      /**
       * ⚠️ **열린 PR을 조용히 닫히게 두지 않는다** (B1 r3 — QA5). head가 base와 같아지면 GitHub이 그 PR을 스스로 닫는다(때로 "merged"로 표시한다).
       * 스냅샷 불변식은 그대로 지키고, **되돌리기 전에** 이유를 남겨 명시적으로 닫는다 — 먼저 되돌리면 자동 종료가 앞서 "merged"가 남을 수 있다.
       * 닫기가 실패하면 되돌리지 않고 던진다 — `lastPulledAt`도 토큰도 그대로라 다음 실행이 같은 판정을 다시 한다.
       */
      const open = await client.findOpenPr(deps.syncBranch);
      if (open !== null) {
        await client.closePr(open.number, closedPrComment(project.baseBranch, project.repoHost));
        closedPr = { number: open.number, url: open.url };
      }
      await client.resetSyncBranch(deps.syncBranch, baseHead);
    }
    // **커밋이 안 나갔어도 갱신한다** — 그 순간 export == base 트리가 검증된 상태다.
    // 안 하면 값 불변 push 한 번 뒤 매일 밤 트리(그리고 수술적이면 blob 파일 수만큼)를 다시 읽는다.
    // ⚠️ **되돌리기보다 뒤에 쓴다** — 아래 커밋 경로와 같은 순서다. force가 실패했는데 먼저 쓰면
    // 그 편집이 1층에 걸려 다음 실행이 스킵하고, 브랜치는 옛 스냅샷 그대로 남는다.
    // ⚠️ `published`를 넘기지 않는다 — 되돌리기는 "보낸" 것이 아니다 (ARCHITECTURE §3).
    // ⚠️ **캡처 편집도 여기서 전달 확인한다** — 원복한 편집이 이 경로로 끝나는데 해제하지 않으면 토큰이 영영 남는다
    // (sync-edit-protection — ARCHITECTURE §3의 "유령 pending"). 값을 고르지 않고 no-op을 탐지할 뿐이다.
    // 언어 변경도 여기서 수렴한다 — 전달된 의도의 취소가 base와 같은 렌더가 되면 PR 닫기·되돌림이 끝난 **뒤에만** 캡처 목록을 확인한다(design §4 목표 4).
    await deps.saveLastPulledAt(project.id, captured, undefined, split.delivered, deliveryContexts, split.withheld, deliveredLocales);
    return { status: "skipped", reason: "no-changes", ...withheld, ...(closedPr === undefined ? {} : { closedPr }), ...localeNotes };
  }

  // 쓰기 전에 센다 — 렌더가 끝난 순간의 base 원문(`current`)과 새 원문을 견주는 관측이고, 아래 쓰기는 이 값을 보지 않는다.
  const changedValues = countChangedValuesOf(resolved, current, changes);
  const summary = `${changes.length} file${changes.length === 1 ? "" : "s"}`;
  // ⚠️ **`publishSnapshot`이 첫 외부 쓰기다** — 여기까지는 읽기뿐이라, 무효화가 실패하면 리포에 아무것도 남지 않는다.
  await deps.invalidateDelivery(project.id, contextIds);
  // 고정 base 위의 스냅샷 하나다 — parent는 base head이고 sync 브랜치는 그 커밋으로 강제로 맞춰진다 (ARCHITECTURE §3).
  const inBase = new Set(baseTree.map(entry => entry.path));
  const files: PublishedFile[] = changes.map(change => ({ path: change.path, kind: change.kind === "delete" ? "removed" : inBase.has(change.path) ? "updated" : "new" }));
  const commitSha = await client.publishSnapshot({
    branch: deps.syncBranch,
    baseSha: baseHead,
    changes: changes.map(change => (change.kind === "upsert" ? { ...change, inBase: inBase.has(change.path) } : change)),
    summary,
  });

  const existing = await client.findOpenPr(deps.syncBranch);
  let prUrl: string;
  if (existing === null) {
    prUrl = await client.createPr(
      deps.syncBranch,
      project.baseBranch,
      PR_TITLE,
      // 영문이다 — 대상 리포에 남는 문자열이고 CLAUDE.md가 PR title/body를 영문으로 못 박았다. 두 호스트가 같은 본문 생성기를 지난다.
      pullRequestBody(files),
    );
  } else {
    // 마커가 커밋 메시지에만 있던 시절의 PR — merge commit으로 머지되면 가드가 못 잡는다. 마커만 되돌리고
    // 제목은 두는 것이라(사람이 고친 제목을 덮지 않는다) 결과가 같으면 PATCH도 없다.
    const title = withSkipMarker(existing.title);
    if (title !== existing.title) await client.updatePrTitle(existing.number, title);
    // 설정에서 base를 바꾼 뒤의 PR이다 — 스냅샷 커밋은 이미 새 base 위에 있다 (launch-readiness L3.7).
    if (existing.base !== project.baseBranch) await client.updatePrBase(existing.number, project.baseBranch);
    // 열린 PR에 삭제가 얹히거나 빠지면 앱 코드 정리 안내가 따라가야 한다(locale-add R-B2 Y3 · spec 수락 기준 7). **삭제 집합이 바뀔 때만** 다시 쓴다(B2 fix2) —
    // 그 밖의 차이로 쓰면 리뷰어가 고친 본문을 매 Publish가 덮는다. 다시 쓸 때는 이 스냅샷의 본문 전체다.
    if (bodyNeedsRefresh(existing.body, files)) await client.updatePr(existing.number, pullRequestBody(files));
    prUrl = existing.url;
  }

  // 마지막에 쓴다 — 먼저 쓰면 실패한 pull이 다음 실행을 스킵시켜 편집이 영영 안 나간다.
  // **보낸 것의 링크가 새로고침을 넘어야 한다** — cron 경로도 여기를 지나므로 야간 pull이 만든 PR도 남는다.
  await deps.saveLastPulledAt(project.id, captured, { prUrl }, split.delivered, deliveryContexts, split.withheld, deliveredLocales);

  return {
    status: "committed",
    delivered: split.delivered.length,
    ...withheld,
    pr: existing === null ? "created" : "updated",
    commitSha,
    prUrl,
    changed: changes.map((c) => c.path),
    files,
    ...localeNotes,
    changedValues,
  };
}

/**
 * 바뀐 파일마다 그 파일을 소유한 표면의 어댑터로 센다. 경로마다 소유 표면이 하나임은 `renderProject`가 이미 검증했다(`surfaceOwnership`).
 *
 * ⚠️ **던지면 `null`로 접는다** — 관측이 Publish를 실패시키면 판정에 끼어든 것과 같다. 쓰기 전이라 던지면 보낼 편집이 남는다.
 */
function countChangedValuesOf(
  resolved: Awaited<ReturnType<typeof renderProject>>["resolved"],
  current: ReadonlyMap<string, string>,
  changes: readonly PullChange[],
): number | null {
  // 삭제 파일은 번역 전달 수가 아니다(locale-add design §4) — 바뀐 값 수에 넣지 않는다.
  const after = new Map(changes.flatMap(c => (c.kind === "upsert" ? [[c.path, c.content] as const] : [])));
  let total = 0;
  try {
    for (const item of resolved) {
      for (const { path } of item.paths) {
        const content = after.get(path);
        if (content !== undefined) total += countFileChangedValues(adapterFor(item.format), item.format, path, current.get(path), content);
      }
    }
  } catch {
    return null;
  }
  return total;
}
