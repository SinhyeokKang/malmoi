import { supportsLocaleChanges } from "@/lib/locales/add-plan";
import { sameLocaleEffects, type LocaleEffect, type LocaleOperation } from "@/lib/locales/effects";
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

export type ProjectLocaleRefusal =
  | { ok: false; error: "irregular-file"; path: string; mode: string }
  | Exclude<LocalePublishPlan, { ok: true }>;

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
      return verdict;
    }
    const { exclude, creates, deletes, withheld, empty, captured } = verdict;
    surfaces.push({ surfaceId: item.surface.id, surfaceSlug: item.surface.slug, exclude, creates, deletes, withheld, empty, captured });
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

/** 전달됐는데 이번 스냅샷이 싣지 않는 언어 효과 — Publish가 열린 PR에서 거둔다. */
export type WithdrawnLocale = { surfaceSlug: string; localeCode: string; effect: LocaleEffect["effect"] };

/**
 * **거둘 언어 효과** (#265 — design-brief 프레임 13 "이전 변경 거두기"). 전달 목록에 있는데 이번 캡처에 없는 효과다. 전달된 의도를 취소하면 그 파일은
 * base와 같아져 파일 diff가 0이지만, 열린 PR에는 옛 삭제·새 파일이 남아 있고 Publish가 그것을 거둔다(no-changes 수렴 또는 PR 갱신). 미리보기가
 * 이 목록으로 "보낼 것 없음"과 가른다. 소스 slug·코드순이다.
 * ⚠️ 확인 안 된 목록(`null`)은 무엇이 실렸는지 몰라 거둘 것을 말하지 않는다 — 취소는 그동안 거부된다(R2).
 */
export function withdrawnLocalesOf(plan: ProjectLocalePlan, surfaces: readonly { id: string; slug: string; localeChanges?: SurfaceLocaleChanges }[]): WithdrawnLocale[] {
  const captured = new Map(plan.surfaces.map(surface => [surface.surfaceId, surface.captured]));
  const out: WithdrawnLocale[] = [];
  for (const surface of surfaces) {
    const delivered = surface.localeChanges?.delivered;
    if (delivered === undefined || delivered === null) continue;
    const now = captured.get(surface.id) ?? [];
    for (const effect of delivered) {
      if (now.some(item => item.localeCode === effect.localeCode && item.effect === effect.effect)) continue;
      out.push({ surfaceSlug: surface.slug, localeCode: effect.localeCode, effect: effect.effect });
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
  empty: { surfaceSlug: string; localeCode: string }[];
};
export function localeNotesOf(plan: ProjectLocalePlan): LocaleNotes | undefined {
  const withheld = plan.surfaces.flatMap(s => s.withheld.map(w => ({ surfaceSlug: s.surfaceSlug, localeCode: w.localeCode, path: w.path, reason: w.reason })));
  const empty = plan.surfaces.flatMap(s => s.empty.map(localeCode => ({ surfaceSlug: s.surfaceSlug, localeCode })));
  return withheld.length === 0 && empty.length === 0 ? undefined : { withheld, empty };
}

/** 소스별 캡처 목록 — 계획에 없는 소스는 `[]`(이 스냅샷이 실은 파일 집합 변경이 없다). 성공 확정이 캡처한 소스마다 그대로 쓴다. */
export function capturedBySurface(plan: ProjectLocalePlan, surfaceIds: readonly string[]): Map<string, LocaleEffect[]> {
  const out = new Map(surfaceIds.map(id => [id, [] as LocaleEffect[]]));
  for (const surface of plan.surfaces) out.set(surface.surfaceId, surface.captured);
  return out;
}
