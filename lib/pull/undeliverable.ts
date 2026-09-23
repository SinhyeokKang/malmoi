import type { LocalFile, RenderError } from "./plan";
import type { PendingEdit } from "./run";

/**
 * **전달 불가 셀의 좌표 보류** (delivery-invariants D3 · 감사 #3 · C). 잎 모듈이다 — 테스트가 직접 import한다.
 *
 * writer 경고를 두 부류로 가른다:
 * - **보류** — 그 좌표의 셀만 이번 PR에 못 싣는다. 비-base per-locale 파일 부재(`original-file-missing`)와 로케일 객체에
 *   자리가 없는 키(`write-slot-missing`). 그 셀의 토큰은 남고 나머지는 Publish한다.
 * - **거부** — 그 밖의 전부. base 파일 부재는 여기다: 사실상 경로 이동·설정 오류이고, 보류로 넘기면 전 셀이 빠져 결과가
 *   "보낼 것 없음"으로 문제를 가린다(사용자 결정 2026-09-24).
 *
 * ⚠️ 판정 입력은 "원본 파일이 트리에 있는가"와 "그 키의 자리가 파일에 있는가"뿐이다 — 값을 보지 않는다(ARCHITECTURE §0 불변식 1).
 */

export type RenderedSurface = { surfaceId: string; surfaceSlug: string; baseLocale: string; files: readonly LocalFile[] };
/** 로케일 통째(`${surfaceId}\0${locale}`)와 셀(`${surfaceId}\0${locale}\0${key}`). */
export type WithheldCoordinates = { locales: Set<string>; cells: Set<string> };

type Classified = { kind: "locale"; coordinate: string } | { kind: "cell"; coordinate: string } | { kind: "blocking" };

function classify(surface: RenderedSurface, file: LocalFile, error: RenderError): Classified {
  if (error.code === "original-file-missing" && file.locale !== undefined && file.locale !== surface.baseLocale) {
    return { kind: "locale", coordinate: `${surface.surfaceId}\0${file.locale}` };
  }
  if (error.code === "write-slot-missing" && error.locale !== undefined && error.key !== undefined) {
    return { kind: "cell", coordinate: `${surface.surfaceId}\0${error.locale}\0${error.key}` };
  }
  return { kind: "blocking" };
}

function* classified(rendered: readonly RenderedSurface[]) {
  for (const surface of rendered) {
    for (const file of surface.files) for (const error of file.errors ?? []) yield { surface, error, verdict: classify(surface, file, error) };
  }
}

export function withheldCoordinates(rendered: readonly RenderedSurface[]): WithheldCoordinates {
  const out: WithheldCoordinates = { locales: new Set(), cells: new Set() };
  for (const { verdict } of classified(rendered)) {
    if (verdict.kind === "locale") out.locales.add(verdict.coordinate);
    else if (verdict.kind === "cell") out.cells.add(verdict.coordinate);
  }
  return out;
}

/** reject 대상 오류만. 문자열 조립(`warnings`)은 호출부가 이 결과로 한다. */
export function blockingErrors(rendered: readonly RenderedSurface[]): { surfaceSlug: string; error: RenderError }[] {
  return [...classified(rendered)].flatMap(({ surface, error, verdict }) => (verdict.kind === "blocking" ? [{ surfaceSlug: surface.surfaceSlug, error }] : []));
}

/**
 * 캡처한 편집을 실린 것/보류된 것으로 가른다. `withheldBy`는 결과 문구가 가르는 사유별 수다 — 파일이 없다(`file`) vs 키 자리가 없다(`key`).
 *
 * ⚠️ **좌표가 있을 때 `cell`이 없는 편집은 보류 쪽이다** — 좌표 밖임을 증명할 수 없다(운영 로더는 늘 채운다 — `load.ts`).
 * 좌표가 없으면 보류할 것이 없으니 전부 실린다(옛 호출부의 계약 그대로).
 */
export function splitEdits(
  edits: readonly PendingEdit[],
  withheld: WithheldCoordinates,
  keyOf: (keyId: string) => string | undefined,
): { delivered: PendingEdit[]; withheld: PendingEdit[]; withheldBy: { file: number; key: number } } {
  const out = { delivered: [] as PendingEdit[], withheld: [] as PendingEdit[], withheldBy: { file: 0, key: 0 } };
  const none = withheld.locales.size === 0 && withheld.cells.size === 0;
  for (const edit of edits) {
    if (none) { out.delivered.push(edit); continue; }
    const cell = edit.cell;
    if (cell === undefined) { out.withheld.push(edit); out.withheldBy.file += 1; continue; }
    if (withheld.locales.has(`${cell.surfaceId}\0${cell.localeCode}`)) { out.withheld.push(edit); out.withheldBy.file += 1; continue; }
    const key = keyOf(cell.keyId);
    if (key !== undefined && withheld.cells.has(`${cell.surfaceId}\0${cell.localeCode}\0${key}`)) { out.withheld.push(edit); out.withheldBy.key += 1; continue; }
    out.delivered.push(edit);
  }
  return out;
}
