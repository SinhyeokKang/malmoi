import type { CandidateSummary } from "./detect";
import { planSurfaceSlug, surfaceOwnership } from "@/lib/surfaces/plan";

/** 탐지 순서는 기본 표면을 정하고, 체크 순서와 미리보기는 제출 순서를 바꾸지 않는다. */
export function planSurfaceSelection(
  candidates: readonly CandidateSummary[],
  checked: ReadonlySet<number>,
  baseLocales: Readonly<Record<number, string>>,
) {
  const formats: { adapter: CandidateSummary["adapter"]; pathTemplate: string; basePath?: string; baseLocale: string; surfaceSlug: string }[] = [];
  const owners: { surfaceId: string; surfaceSlug: string; paths: string[] }[] = [];
  let defaultIndex: number | null = null;
  candidates.forEach((candidate, index) => {
    if (!checked.has(index)) return;
    defaultIndex ??= index;
    const surfaceSlug = planSurfaceSlug(candidate.pathTemplate, formats.map(format => format.surfaceSlug));
    // basePath는 생성이 기준 언어 파일을 내려받는 데 필요하다(mobile-strings design §2) — 생성은 재탐지 값과 다시 견준다.
    formats.push({ adapter: candidate.adapter, pathTemplate: candidate.pathTemplate,
      ...(candidate.basePath === undefined ? {} : { basePath: candidate.basePath }),
      baseLocale: baseLocales[index] ?? "", surfaceSlug });
    owners.push({ surfaceId: String(index), surfaceSlug, paths: candidate.outputPaths });
  });
  const ownership = surfaceOwnership(owners);
  return { formats, defaultIndex, conflicts: ownership.ok ? [] : ownership.conflicts };
}
