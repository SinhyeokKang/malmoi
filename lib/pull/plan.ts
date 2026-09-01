import { ADAPTERS, compareKeys } from "@/lib/adapters";
import type { Adapter, AdapterName, DetectedFormat, LocaleEntry } from "@/lib/adapters";
import { blobSha } from "@/lib/githash";

/**
 * pull의 판정 전부. **I/O가 없다** — GitHub 호출과 DB 조회는 껍데기(`lib/pull/run.ts`)가 맡고
 * 여기는 "무엇을 낼지"만 결정한다. 그래서 야간 cron의 기본 경로(변경 없음)를 테스트로 못 박을 수 있다.
 *
 * 판정이 두 층인 이유는 ARCHITECTURE §2에 있다 — 1층(`shouldSkipPull`)은 어댑터 방식과 무관하게
 * 성립하고, 2층(`planPullChanges`)은 blob SHA를 비교한다.
 *
 * ⚠️ `server-only`를 붙이지 않는다 — 테스트가 직접 import하는 순수 모듈이라 그 패키지가 던진다.
 */

// ── 1층: DB 측 스킵 ─────────────────────────────────────────────────────────

/**
 * GitHub을 한 번도 부르지 않고 끝낼 수 있는가.
 *
 * @param maxUpdatedAt 그 프로젝트 `Translation.updatedAt`의 최대값. 편집이 0건이면 `null`.
 * @param lastPulledAt 마지막으로 성공한 pull의 기준 시각. 첫 pull이면 `null`.
 */
export function shouldSkipPull(maxUpdatedAt: Date | null, lastPulledAt: Date | null): boolean {
  // 낼 것이 아예 없으면 첫 pull이어도 커밋을 만들지 않는다 — 빈 DB로 파일을 뽑으면 안 된다.
  if (maxUpdatedAt === null) return true;
  // 첫 pull은 리포에 아무것도 안 나간 상태다. 무조건 진행한다.
  if (lastPulledAt === null) return false;
  return maxUpdatedAt.getTime() <= lastPulledAt.getTime();
}

// ── 포맷 재조립 ─────────────────────────────────────────────────────────────

/** `Project`의 포맷 컬럼 4개. push가 채우고 pull이 읽는다 — 전부 nullable이다. */
export type ProjectFormatColumns = {
  adapterName: string | null;
  pathTemplate: string | null;
  nested: boolean | null;
  baseLocale: string | null;
};

function isAdapterName(name: string): name is AdapterName {
  return ADAPTERS.some((a) => a.name === name);
}

/**
 * `Project` 컬럼 → `DetectedFormat`.
 *
 * **pull 경로엔 `read`가 없어 여기가 유일한 포맷 출처다.** push가 리포를 탐지해 저장한 값을
 * 그대로 되살린다 (MVP §5.1). 컬럼이 비어 있으면 아직 push를 받지 않은 프로젝트이므로 던진다 —
 * 조용히 기본값을 고르면 엉뚱한 경로의 파일을 덮는다.
 *
 * @param locales `Locale` 테이블의 코드 목록. `Project`엔 로케일이 없어 따로 받는다.
 */
export function formatFromProject(
  cols: ProjectFormatColumns,
  locales: readonly string[],
): DetectedFormat {
  const { adapterName, pathTemplate, baseLocale } = cols;
  if (adapterName === null) throw new Error("Project.adapterName이 비어 있다 (push를 먼저 받아야 한다)");
  if (pathTemplate === null) throw new Error("Project.pathTemplate이 비어 있다 (push를 먼저 받아야 한다)");
  if (baseLocale === null) throw new Error("Project.baseLocale이 비어 있다 (base 판정 불가)");
  // 문자열 컬럼이라 DB가 값을 제약하지 않는다. 여기서 걸러야 adapterFor가 나중에 터지지 않는다.
  if (!isAdapterName(adapterName)) throw new Error(`등록되지 않은 어댑터: ${adapterName}`);
  if (locales.length === 0) throw new Error("로케일이 0개다 (낼 파일이 없다)");

  return {
    adapter: adapterName,
    pathTemplate,
    locales: [...locales],
    // flat 전용 어댑터엔 무의미한 값이라 null을 undefined로 접는다.
    ...(cols.nested === null ? {} : { nested: cols.nested }),
  };
}

// ── 경로 결정 ───────────────────────────────────────────────────────────────

export type LocalePath = {
  /** `multi-locale`은 한 파일이 여러 로케일을 담아 비어 있다. */
  locale?: string;
  path: string;
};

/**
 * 글롭 → 정규식. `*`가 `/`를 먹으면 하위 디렉터리의 엉뚱한 파일을 덮는다.
 *
 * **`*`를 뺀 정규식 특수문자를 전부 이스케이프한다** — `?`를 빼먹으면 경로에 그 문자가 있을 때
 * 정규식의 "직전 문자 0~1개"로 해석돼 조용히 다른 파일을 매칭한다. 지원하는 와일드카드는 `*` 하나다.
 */
function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", "[^/]*");
  return new RegExp(`^${escaped}$`);
}

/**
 * 쓸 파일 경로를 정한다.
 *
 * @param layout 어댑터의 배치 방식. **`DetectedFormat`이 아니라 `Adapter`가 든 값이라** 별도 인자다.
 * @param treePaths base 트리의 파일 경로 목록. `multi-locale`의 글롭 매칭 대상이다.
 */
export function resolveLocalePaths(
  format: DetectedFormat,
  layout: Adapter["layout"],
  treePaths: readonly string[],
): LocalePath[] {
  if (layout === "per-locale") {
    // 치환 토큰이 없으면 모든 로케일이 **같은 경로**를 받는다 — 트리에 같은 path가 여러 번 실려
    // 마지막 로케일 내용이 이기고, 에러도 경고도 없다. `detect`가 만든 템플릿엔 항상 있으므로
    // 손으로 DB를 고쳤을 때만 열리는 구멍이지만 방어가 한 줄이다.
    // **multi-locale은 이 검사를 받지 않는다** — 정의상 치환하지 않는다 (ARCHITECTURE §1.1).
    if (format.locales.length > 1 && !format.pathTemplate.includes("{locale}")) {
      throw new Error(`per-locale인데 pathTemplate에 {locale}이 없다: ${format.pathTemplate}`);
    }
    // 파일이 아직 없어도 새로 만든다 — 트리를 보지 않는 것이 이 갈래의 요지다.
    // 정렬하는 이유: 이 순서가 트리 페이로드 순서가 되고, 흔들리면 커밋이 비결정적이 된다.
    return [...format.locales]
      .sort(compareKeys)
      .map((locale) => ({ locale, path: format.pathTemplate.replaceAll("{locale}", locale) }));
  }

  const pattern = globToRegExp(format.pathTemplate);
  const matched = treePaths.filter((p) => pattern.test(p)).sort(compareKeys);
  // 0개는 "낼 것이 없다"가 아니라 **경로가 이동했다**는 신호다. 조용히 빈 PR을 내면 안 된다.
  if (matched.length === 0) {
    throw new Error(`글롭이 매칭한 파일이 0개다: ${format.pathTemplate}`);
  }
  return matched.map((path) => ({ path }));
}

// ── writer에 넘길 entries ───────────────────────────────────────────────────

/** DB에서 읽은 한 로케일의 한 키. `value`가 `null`이면 `Translation` 행이 없다는 뜻이다. */
export type PullRow = {
  key: string;
  sourceText: string;
  description?: string;
  orphaned: boolean;
  value: string | null;
};

/**
 * **writer에 넘길 entries의 유일한 관문이다.**
 *
 * `ts-dict`는 `usableEntries`를 지나지 않으므로(ARCHITECTURE §1.4) 빈 값이 여기서 새면 원본
 * 리터럴이 `""`로 치환되고, TS 딕셔너리엔 폴백이 없어 그대로 렌더된다. 재생성 어댑터는 내부에서
 * 한 번 더 거르지만, **두 방식에 똑같이 적용되는 지점은 여기뿐**이다 (MVP §4.1).
 *
 * 정렬하지 않는다 — 재생성은 어댑터가 정렬하고, 수술적 치환은 원본 순서를 보존해야 한다.
 */
export function buildWriteEntries(
  rows: readonly PullRow[],
  opts: { isBase: boolean },
): LocaleEntry[] {
  const entries: LocaleEntry[] = [];
  for (const row of rows) {
    // 코드에서 사라진 키. 재생성은 파일에서 빠지고, 수술적 치환은 값을 안 바꿔 원본이 남는다.
    if (row.orphaned) continue;
    // base 파일은 행이 없으면 sourceText로 폴백한다 (MVP §3.2). **행이 있는데 빈 값이면 폴백하지
    // 않는다** — 그건 "지우기"라는 정당한 조작이고, 미번역으로 떨어져 파일에서 빠지는 게 맞다.
    const message = row.value ?? (opts.isBase ? row.sourceText : null);
    if (message === null || message === "") continue;
    entries.push({
      key: row.key,
      message,
      // 빈 description은 싣지 않는다 — 없는 것과 같아야 파일이 결정적이다.
      ...(row.description ? { description: row.description } : {}),
    });
  }
  return entries;
}

// ── 2층: blob SHA 비교 ──────────────────────────────────────────────────────

/** writer의 출력. `content`가 `null`이면 낼 항목이 0개라 파일을 만들지 않는다 (MVP §4.1). */
export type LocalFile = { path: string; content: string | null };
export type TreeBlob = { path: string; sha: string };
export type PullChange = { path: string; content: string };

/**
 * base 트리와 비교해 실제로 바뀐 파일만 고른다. **전부 같으면 빈 배열이고, 그때 GitHub API를
 * 더 부르지 않는다** — 야간 cron의 기본 경로다 (ARCHITECTURE §2).
 *
 * **삭제를 내지 않는다.** base에만 있는 경로는 건드리지 않고, writer가 `null`을 준 경로도
 * 기존 파일을 그대로 남긴다 — 파일을 지우는 pull은 없다.
 */
export function planPullChanges(
  local: readonly LocalFile[],
  baseTree: readonly TreeBlob[],
): PullChange[] {
  const baseShas = new Map(baseTree.map((b) => [b.path, b.sha]));
  const changes: PullChange[] = [];
  for (const file of local) {
    if (file.content === null) continue;
    if (baseShas.get(file.path) === blobSha(file.content)) continue;
    changes.push({ path: file.path, content: file.content });
  }
  // 트리 페이로드 순서가 결정적이어야 blob SHA 비교가 매번 같은 답을 낸다.
  return changes.sort((a, b) => compareKeys(a.path, b.path));
}
