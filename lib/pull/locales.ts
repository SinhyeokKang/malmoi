import { localeFilePath, supportsLocaleChanges } from "@/lib/locales/add-plan";
import { localeEffects, sameLocaleEffects, type LocaleEffect, type LocaleOperation } from "@/lib/locales/effects";
import { planLocaleExpiry, type PullRequestCheck } from "@/lib/locales/expiry";
import { localeWork } from "@/lib/locales/work";
import { planLocalePublish, type LocalePublishPlan } from "@/lib/locales/publish-plan";
import { localeFromPath } from "@/lib/adapters/chrome-locales";
import { compareCodeUnits } from "@/lib/compare";
import type { Adapter, DetectedFormat } from "@/lib/adapters";
import { resolveLocalePaths } from "./plan";

/**
 * **언어 변경 의도 → 이번 Publish의 파일 집합** (locale-add design §2·§4). 판정은 `planLocalePublish`(A1)이고, 여기는 프로젝트의 소스들과
 * base 트리를 그 입력으로 펴는 순수 층이다. 실행(`runPull`)과 미리보기(`lib/publish/read.ts`)가 **같은 함수로** 생성·삭제·보류를 얻는다.
 *
 * ⚠️ `server-only`를 붙이지 않는다 — 테스트가 직접 import한다.
 * ⚠️ 코드를 객체 프로퍼티로 쓰지 않는다 — 값 수는 Map, 목록은 배열이다(`__proto__`).
 */

/** 스냅샷이 읽은 한 소스의 언어 변경 상태(`lib/pull/load.ts` — `readLocaleStates`의 같은 스냅샷). 행도 전달 목록도 없는 소스는 없다. */
export type SurfaceLocaleChanges = {
  rows: readonly { localeCode: string; operation: LocaleOperation; requestedAt: Date }[];
  /** ADD 언어의 값 있는 번역 수 — 행이 없는 코드는 0이다(`readLocaleValueCounts`). */
  valueCounts: ReadonlyMap<string, number>;
  /** 마지막 전달 목록. `null`은 확인 안 됨(무효화 중). */
  delivered: readonly LocaleEffect[] | null;
  /** 언어 변경 작업 수(`localeWork(...).length`) — 1층 스킵의 입력이다. */
  work: number;
};

type LocalePath = { localeCode: string; path: string };
export type SurfaceLocalePlan = {
  surfaceId: string;
  surfaceSlug: string;
  /** 정규 렌더가 건너뛸 코드 — REMOVE · 보류된 ADD · 빈 ADD. */
  exclude: string[];
  creates: LocalePath[];
  deletes: LocalePath[];
  withheld: (LocalePath & { reason: "proposal-path-exists" })[];
  empty: string[];
  /** 이 스냅샷이 실제로 이루는 효과. PR/MR 경계까지 성공하면 이 목록이 그 소스의 전달 목록이 된다. */
  captured: LocaleEffect[];
  /** 그 소스의 경로 템플릿 — 화면이 빈 추가를 파일 행으로 말할 경로(`localeNotesOf`)를 같은 판정(`localeFilePath`)으로 낸다. 없으면 경로를 모른다. */
  pathTemplate?: string | null;
};
/** 행이 있는 소스만 담는다. 비면 기존 Publish와 같다. */
export type ProjectLocalePlan = { surfaces: SurfaceLocalePlan[] };
export const NO_LOCALE_PLAN: ProjectLocalePlan = { surfaces: [] };

type TreeEntry = { path: string; sha: string; mode: string };
type FormatItem = {
  surface: { id: string; slug: string; pathTemplate: string | null; localeChanges?: SurfaceLocaleChanges };
  format: DetectedFormat;
  layout: Adapter["layout"];
};

/**
 * 거부한 소스와 그 경로에 닿은 언어 — 화면이 고칠 자리를 말한다(시안 P1 ⑥). `ownerSlug`는 경로 충돌일 때 그 경로를 쥔 다른 소스다(계획이 쓴 같은 경로 목록에서 찾는다).
 * 안전하지 않은 경로는 계산되지 않아 언어를 모른다.
 */
export type LocaleRefusalSite = { surfaceSlug: string; localeCode: string | null; ownerSlug: string | null };

export type ProjectLocaleRefusal =
  | { ok: false; error: "irregular-file"; path: string; mode: string }
  | (Exclude<LocalePublishPlan, { ok: true }> & { site?: LocaleRefusalSite });

const REGULAR = new Set(["100644", "100755"]);

/**
 * @param tree 읽은 base head의 트리. **못 읽었으면 여기 오지 않는다** — 읽기 실패는 부재가 아니다(POSTMORTEM 2026-09-27). 호출부가 던진다.
 */
export function planProjectLocales(formats: readonly FormatItem[], tree: readonly TreeEntry[]): { ok: true; plan: ProjectLocalePlan } | ProjectLocaleRefusal {
  const withRows = formats.filter(item => (item.surface.localeChanges?.rows.length ?? 0) > 0);
  if (withRows.length === 0) return { ok: true, plan: NO_LOCALE_PLAN };
  const files = new Map(tree.map(entry => [entry.path, REGULAR.has(entry.mode) ? "regular" as const : "irregular" as const]));
  const treePaths = tree.map(entry => entry.path);
  /** 소스별로 이 스냅샷이 쓰는 경로 — 변경 행이 있는 코드는 뺀다(그 경로의 운명은 계획이 정한다). */
  const pathsOf = (item: FormatItem, without: ReadonlySet<string>) => {
    const locales = item.format.locales.filter(code => !without.has(code));
    if (item.layout === "per-locale" && locales.length === 0) return [];
    return resolveLocalePaths({ ...item.format, locales }, item.layout, treePaths).map(p => p.path);
  };
  const surfaces: SurfaceLocalePlan[] = [];
  for (const item of withRows) {
    const changes = item.surface.localeChanges!;
    const codes = new Set(changes.rows.map(row => row.localeCode));
    const verdict = planLocalePublish({
      pathTemplate: item.surface.pathTemplate,
      changes: changes.rows.map(row => ({ localeCode: row.localeCode, operation: row.operation })),
      delivered: changes.delivered,
      valueCounts: changes.valueCounts,
      base: { status: "read", files },
      upsertPaths: pathsOf(item, codes),
      foreignPaths: formats.filter(other => other.surface.id !== item.surface.id).flatMap(other => pathsOf(other, new Set())),
    });
    if (!verdict.ok) {
      if (verdict.error === "irregular-file") return { ok: false, error: "irregular-file", path: verdict.path, mode: tree.find(entry => entry.path === verdict.path)?.mode ?? "" };
      const path = "path" in verdict ? verdict.path : null;
      const template = item.surface.pathTemplate;
      // ⚠️ 경로 → 언어·소유 소스는 계획이 쓴 **같은 판정**으로 되짚는다 — 언어는 `localeFilePath`, 소유는 `foreignPaths`를 만든 `pathsOf`다(두 번째 술어를 두지 않는다).
      const localeCode = path === null || template === null ? null : changes.rows.find(row => localeFilePath(template, row.localeCode) === path)?.localeCode ?? null;
      const owner = verdict.error === "path-conflict" ? formats.find(other => other.surface.id !== item.surface.id && pathsOf(other, new Set()).includes(verdict.path)) : undefined;
      return { ...verdict, site: { surfaceSlug: item.surface.slug, localeCode, ownerSlug: owner?.surface.slug ?? null } };
    }
    const { exclude, creates, deletes, withheld, empty, captured } = verdict;
    surfaces.push({ surfaceId: item.surface.id, surfaceSlug: item.surface.slug, exclude, creates, deletes, withheld, empty, captured, pathTemplate: item.surface.pathTemplate });
  }
  return { ok: true, plan: { surfaces } };
}

/**
 * **이 스냅샷이 실제로 보낼 수 있는 언어 작업 수** (R-B2 Y1) — 소스마다 캡처할 효과 목록이 전달 목록과 다르면 1이다(정규형 비교, `delivered: null`은
 * 늘 다르다 — 확인 안 된 목록은 다시 확인해야 한다). `localeWorkOf`와 달리 보류된 ADD(`proposal-path-exists`)는 세지 않는다 — 그 ADD는 이번 스냅샷에
 * 실리지 않으므로, 그것 때문에 Publish가 쓰기·PR 닫기·브랜치 되돌림까지 가면 "이 편집들 몫이 아니면 쓰지 않는다"가 깨진다.
 */
export function deliverableLocaleWork(plan: ProjectLocalePlan, surfaces: readonly { id: string; localeChanges?: SurfaceLocaleChanges }[]): number {
  const captured = new Map(plan.surfaces.map(surface => [surface.surfaceId, surface.captured]));
  let work = 0;
  for (const surface of surfaces) {
    const changes = surface.localeChanges;
    if (changes === undefined) continue;
    if (changes.delivered === null || !sameLocaleEffects(captured.get(surface.id) ?? [], changes.delivered)) work += 1;
  }
  return work;
}

/** 전달됐는데 이번 스냅샷이 싣지 않는 언어 효과 — Publish가 열린 PR에서 거둔다. `path`는 그 소스 템플릿의 경로다(모르면 `null` — 화면의 파일 행). */
export type WithdrawnLocale = { surfaceSlug: string; localeCode: string; effect: LocaleEffect["effect"]; path: string | null };

/**
 * **거둘 언어 효과** (#265 — design-brief 프레임 13 "이전 변경 거두기"). 전달 목록에 있는데 이번 캡처에 없는 효과다. 전달된 의도를 취소하면 그 파일은
 * base와 같아져 파일 diff가 0이지만, 열린 PR에는 옛 삭제·새 파일이 남아 있고 Publish가 그것을 거둔다(no-changes 수렴 또는 PR 갱신). 미리보기가
 * 이 목록으로 "보낼 것 없음"과 가른다. 소스 slug·코드순이다.
 * ⚠️ 확인 안 된 목록(`null`)은 무엇이 실렸는지 몰라 거둘 것을 말하지 않는다 — 취소는 그동안 거부된다(R2).
 */
export function withdrawnLocalesOf(plan: ProjectLocalePlan, surfaces: readonly { id: string; slug: string; pathTemplate?: string | null; localeChanges?: SurfaceLocaleChanges }[]): WithdrawnLocale[] {
  const captured = new Map(plan.surfaces.map(surface => [surface.surfaceId, surface.captured]));
  const out: WithdrawnLocale[] = [];
  for (const surface of surfaces) {
    const delivered = surface.localeChanges?.delivered;
    if (delivered === undefined || delivered === null) continue;
    const now = captured.get(surface.id) ?? [];
    for (const effect of delivered) {
      if (now.some(item => item.localeCode === effect.localeCode && item.effect === effect.effect)) continue;
      const template = surface.pathTemplate ?? null;
      out.push({ surfaceSlug: surface.slug, localeCode: effect.localeCode, effect: effect.effect, path: template === null ? null : localeFilePath(template, effect.localeCode) });
    }
  }
  return out.sort((a, b) => compareCodeUnits(a.surfaceSlug, b.surfaceSlug) || compareCodeUnits(a.localeCode, b.localeCode));
}

/** 프로젝트의 언어 변경 작업 수 — 소스별 합. 셀 편집 수와 따로 싣는다(design §4 "집계·보호"). */
export function localeWorkOf(surfaces: readonly { localeChanges?: SurfaceLocaleChanges }[]): number {
  return surfaces.reduce((sum, surface) => sum + (surface.localeChanges?.work ?? 0), 0);
}

/** 행이 하나라도 있는 프로젝트인가 — 스냅샷 전 만료·지문의 base 입력이 이때만 선다(행이 없으면 기존 순서 그대로). */
export function hasLocaleRows(surfaces: readonly { localeChanges?: SurfaceLocaleChanges }[]): boolean {
  return surfaces.some(surface => (surface.localeChanges?.rows.length ?? 0) > 0);
}

/**
 * 스냅샷 전 만료가 정리하는(정리한) 언어 요청 — 실행 결과의 `expired`와 미리보기의 `expiringLocales`가 같은 형이다(#267). `presence`는 만료 뒤 그 언어의
 * 존재다(`planLocaleExpiry` — strict 적재와 같은 관측 판정). ⚠️ **열린 PR 조회는 "열림/없음"만 안다** — 머지됐는지 머지 없이 닫혔는지는 base 관측이
 * 가른다(`reachedRepository` — `lib/locales/reached.ts`). presence를 버리면 머지된 제거를 "다시 만들 새 파일"로 약속한다(fix1 R1).
 */
export type ExpiredLocaleRequest = { surfaceSlug: string; localeCode: string; operation: LocaleOperation; presence: "active" | "orphan" };

/**
 * **스냅샷 전 만료를 1층 스킵보다 먼저 돌아야 하나** (#267). 작업이 있으면 원래대로 돈다. 작업이 0이어도 전달된 효과가 있는 행 소스가 있으면 돈다 —
 * 전달된 언어 변경의 PR/MR이 머지됐거나 머지 없이 닫힌 뒤 방문 전인 창은 현재 = 전달이라 작업이 0인데, 1층에서 끝나면 만료가 돌지 않는다(R4).
 * ⚠️ 전달된 효과가 없는 행(값 0개 ADD)·확인 안 된 목록(`null` — 만료할 수 없다)은 1층 그대로다 — 원격 0회를 지킨다. 그 행의 관측 만료는 방문(CI·야간)이 맡는다.
 * 실행(`runPull`)과 미리보기(`lib/publish/read.ts`)가 이 판정 하나를 쓴다 — 갈리면 미리보기가 정리될 요청을 말하는데 실행이 1층에서 끝난다.
 */
export function expiryCheckApplies(unpublished: number, surfaces: readonly { localeChanges?: SurfaceLocaleChanges }[]): boolean {
  if (!hasLocaleRows(surfaces)) return false;
  if (unpublished > 0 || localeWorkOf(surfaces) > 0) return true;
  return surfaces.some(surface => (surface.localeChanges?.rows.length ?? 0) > 0 && (surface.localeChanges?.delivered?.length ?? 0) > 0);
}

/**
 * **만료 판정의 읽기 전용 쪽** (#267) — 미리보기가 쓰기 없이 실행과 같은 `planLocaleExpiry`를 같은 스냅샷에 대 본다. 입력은 `readLocaleStates`가 잠금 뒤
 * 다시 읽는 것과 같은 뜻이다: 현재 효과는 같은 `localeEffects`, 행의 orphan은 그 소스의 활성 목록에 없음(행의 로케일은 늘 그 소스의 행이다).
 * ⚠️ `pullRequest`는 성공한 조회만 `none-open`이다 — 모름을 없음으로 접으면 열린 PR의 삭제를 "버려진다"고 말한다.
 * ⚠️ **조회 실패면 아무것도 말하지 않는다** — 판정은 모순 행(orphan ADD)을 PR 상태와 무관하게 만료로 보지만, 실행은 조회 실패에서 만료 전에 실패한다(fix1 W4).
 */
export function expiringLocalesOf(
  formats: readonly { surface: { slug: string; adapterName: string | null; localeCodes: readonly string[]; localeChanges?: SurfaceLocaleChanges }; format: DetectedFormat }[],
  pullRequest: PullRequestCheck,
  tree: readonly TreeEntry[],
): ExpiredLocaleRequest[] {
  if (pullRequest === "failed") return [];
  return formats.flatMap(item => {
    const changes = item.surface.localeChanges;
    if (changes === undefined || changes.rows.length === 0) return [];
    const plan = planLocaleExpiry({
      pullRequest,
      current: localeEffects(changes.rows, changes.valueCounts),
      delivered: changes.delivered,
      rows: changes.rows.map(row => ({ localeCode: row.localeCode, operation: row.operation, orphaned: !item.surface.localeCodes.includes(row.localeCode) })),
      observed: observedLocalesOf(item, tree),
    });
    return plan.expired.map(expired => ({ surfaceSlug: item.surface.slug, localeCode: expired.localeCode, operation: expired.operation, presence: expired.presence }));
  });
}

/**
 * 만료 뒤의 상태 — `expireLocaleChanges`가 쓰는 것을 메모리에서 흉내 낸다(#267): 행 삭제 · 전달 목록에서 그 코드의 효과 빼기 · 존재(`presence`)대로 활성 목록
 * 맞추기 · 작업 수 다시 세기. 미리보기가 정리될 요청의 삭제·새 파일을 약속하지 않게 하는 용도다. 셀은 비활성 언어 것까지 스냅샷에 실려 있어(`loadPullState`)
 * 되살아난 언어도 실제 값으로 렌더된다. ⚠️ 활성 전환을 빼면 머지된 제거가 지운 파일을 new로, 머지 없이 닫힌 추가가 버린 파일을 new로 약속한다(fix1 R1·R2).
 * 만료가 없으면 입력을 그대로 돌려준다.
 */
export function afterExpiry<S extends { slug: string; localeCodes: string[]; localeChanges?: SurfaceLocaleChanges }>(surfaces: S[], expired: readonly ExpiredLocaleRequest[]): S[] {
  if (expired.length === 0) return surfaces;
  return surfaces.map(surface => {
    const changes = surface.localeChanges;
    const mine = expired.filter(item => item.surfaceSlug === surface.slug);
    if (changes === undefined || mine.length === 0) return surface;
    const codes = new Set(mine.map(item => item.localeCode));
    const rows = changes.rows.filter(row => !codes.has(row.localeCode));
    const delivered = changes.delivered === null ? null : changes.delivered.filter(effect => !codes.has(effect.localeCode));
    const active = new Set(surface.localeCodes);
    for (const item of mine) {
      if (item.presence === "active") active.add(item.localeCode);
      else active.delete(item.localeCode);
    }
    return { ...surface, localeCodes: [...active].sort(compareCodeUnits),
      localeChanges: { ...changes, rows, delivered, work: localeWork(localeEffects(rows, changes.valueCounts), delivered).length } };
  });
}

export type LocaleObservation = { status: "observed"; locales: string[] } | { status: "unreadable" };

/**
 * base 트리에서 관측한 이 소스의 로케일 — 만료 판정의 `observed`(strict 적재의 `payload.locales`와 같은 뜻). Publish 스냅샷 전 만료(`observedLocalesOf`)·
 * 같은 head 야간 만료·야간 적재 만료(`lib/import/observe.ts`)가 **이 함수 하나**를 쓴다(R-B2 Y4) — 같은 트리에서 한쪽이 활성, 다른 쪽이 orphan으로 돌리지
 * 않는다. 의미는 어댑터 읽기(`localeFromPath`) + **정규 파일**(100644·100755)이다 — 링크·하위 모듈은 로케일 파일이 아니다.
 * 개별 파일을 재생성하는 포맷이 아니면 로케일별 파일로 관측할 수 없어 `unreadable`이다 — 만료는 보류된다(fail-closed).
 * ⚠️ 템플릿에 맞는 경로의 mode를 모르면 `unreadable`이다 — 정규 파일로 가정하면 링크를 로케일로 센다.
 */
export function observeLocaleFiles(tree: readonly { path: string; mode?: string }[], surface: { adapterName: string | null; pathTemplate: string | null }): LocaleObservation {
  const { pathTemplate } = surface;
  if (!supportsLocaleChanges(surface.adapterName) || pathTemplate === null) return { status: "unreadable" };
  const locales = new Set<string>();
  for (const entry of tree) {
    const locale = localeFromPath(pathTemplate, entry.path);
    if (locale === undefined) continue;
    if (entry.mode === undefined) return { status: "unreadable" };
    if (REGULAR.has(entry.mode)) locales.add(locale);
  }
  return { status: "observed", locales: [...locales].sort(compareCodeUnits) };
}

/** Publish 스냅샷의 소스 하나 — 렌더 포맷의 경로 템플릿으로 `observeLocaleFiles`를 부른다. */
export function observedLocalesOf(item: { surface: { adapterName: string | null }; format: DetectedFormat }, tree: readonly TreeEntry[]): LocaleObservation {
  return observeLocaleFiles(tree, { adapterName: item.surface.adapterName, pathTemplate: item.format.pathTemplate });
}

/**
 * 지문의 base 입력 (design §2 — "Publish 미리보기는 base head·대상 blob·삭제 경로에도 묶는다"). 행마다 그 경로의 base blob SHA(없으면 `null`)와
 * 이번 계획의 삭제 경로다. 행이 없으면 빈 입력이라 지문 바이트가 옛것 그대로다.
 */
export function localeFingerprintInput(plan: ProjectLocalePlan, formats: readonly FormatItem[], tree: readonly TreeEntry[]): { targets: [string, string | null][]; deletes: string[] } {
  const shaByPath = new Map(tree.map(entry => [entry.path, entry.sha]));
  const targets: [string, string | null][] = [];
  for (const item of formats) {
    for (const row of item.surface.localeChanges?.rows ?? []) {
      const path = item.surface.pathTemplate?.replaceAll("{locale}", row.localeCode);
      if (path !== undefined) targets.push([path, shaByPath.get(path) ?? null]);
    }
  }
  return {
    targets: targets.sort((a, b) => compareCodeUnits(a[0], b[0])),
    deletes: plan.surfaces.flatMap(surface => surface.deletes.map(d => d.path)).sort(compareCodeUnits),
  };
}

/** 결과·미리보기가 싣는 언어 보류 안내 — 문장이 아니라 데이터다(화면 문구는 시안 배치). 둘 다 비면 `undefined`. */
export type LocaleNotes = {
  withheld: { surfaceSlug: string; localeCode: string; path: string; reason: "proposal-path-exists" }[];
  /** `path` — 값이 생기면 만들 파일(화면의 `Not included` 행). 템플릿을 모르면 `null`이다. */
  empty: { surfaceSlug: string; localeCode: string; path: string | null }[];
};
export function localeNotesOf(plan: ProjectLocalePlan): LocaleNotes | undefined {
  const withheld = plan.surfaces.flatMap(s => s.withheld.map(w => ({ surfaceSlug: s.surfaceSlug, localeCode: w.localeCode, path: w.path, reason: w.reason })));
  const empty = plan.surfaces.flatMap(s => s.empty.map(localeCode => ({ surfaceSlug: s.surfaceSlug, localeCode,
    path: s.pathTemplate === undefined || s.pathTemplate === null ? null : localeFilePath(s.pathTemplate, localeCode) })));
  return withheld.length === 0 && empty.length === 0 ? undefined : { withheld, empty };
}

/** 소스별 캡처 목록 — 계획에 없는 소스는 `[]`(이 스냅샷이 실은 파일 집합 변경이 없다). 성공 확정이 캡처한 소스마다 그대로 쓴다. */
export function capturedBySurface(plan: ProjectLocalePlan, surfaceIds: readonly string[]): Map<string, LocaleEffect[]> {
  const out = new Map(surfaceIds.map(id => [id, [] as LocaleEffect[]]));
  for (const surface of plan.surfaces) out.set(surface.surfaceId, surface.captured);
  return out;
}
