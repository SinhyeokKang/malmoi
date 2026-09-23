import { compareKeys } from "@/lib/adapters/shared";
import { maskEmail } from "@/lib/auth/email";
import { ALL_NAMESPACES, type KeyState } from "@/lib/routes";

/**
 * 키 리스트 화면의 순수 판정. DB 조회 결과를 받아 사이드바 집계·배지·permalink를 만든다.
 * I/O가 없어 테스트가 자기완결한다.
 */

export type KeyRefRow = {
  path: string;
  line: number;
};

/** 한 로케일의 번역 셀. 테이블의 한 칸이다. */
export type Cell = {
  surfaceArchivedAt: Date | null;
  value: string | null;
  needsReview: boolean;
  updatedBy: string | null;
  updatedAt: Date;
  /**
   * `isUnpublished`가 읽는다 — 아직 전달 확인되지 않은 편집 토큰이 있는가(`pendingWhere`의 투영).
   * ⚠️ **토큰 원문이 아니라 boolean이다** — 이 객체는 RSC 페이로드로 화면에 가고, 원문이 새면 폐기 승인 지문을 위조할 수 있다.
   */
  pending: boolean;
};

/**
 * 셀을 편집한 사람. `User` 행에서 온다 — **프로젝트가 아니라 사용자에 속한 테이블**이므로
 * 조회를 좁히는 축이 `projectId`가 아니다 (POSTMORTEM 2026-09-06). 조회할 id는
 * `collectActorIds`가 **이 프로젝트의 번역 행에서만** 모으므로 다른 테넌트의 사람이 들어오지 않는다.
 */
export type Actor = {
  id: string;
  name: string | null;
  email: string;
};

/**
 * 조회할 편집자 식별자 — 중복을 접고 빈 값을 버린다.
 *
 * 행마다 조회하면 키 수만큼 왕복이 된다(903키 리포가 실재한다). 빈 배열이면 호출부가 조회를
 * 아예 건너뛴다 — 편집 이력이 없는 프로젝트가 흔하다.
 */
export function collectActorIds(rows: KeyRow[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    for (const cell of Object.values(row.cells)) {
      if (cell?.updatedBy) ids.add(cell.updatedBy);
    }
  }
  return [...ids];
}

/**
 * `Translation.updatedBy` → 화면에 찍을 라벨. 없으면 `null`(셀에 아무것도 붙지 않는다).
 *
 * ⚠️ **찾지 못한 값을 버리지 않고 원문 그대로 낸다.** 이 컬럼은 두 종류가 섞여 있다 —
 * 2026-09-05부터 `User.id`이고 그 전 행은 GitHub 핸들이다(`prisma/schema.prisma`가 FK를 안 거는
 * 이유). 못 찾은 것을 지우면 옛 행의 편집자가 화면에서 사라지고, cuid 모양으로 갈라내려 하면
 * 지워진 `User`의 id가 그 판정에 걸려 함께 사라진다.
 *
 * 이름이 없으면 **마스킹한** 이메일이다 — 이 표는 프로젝트 멤버 전원이 보므로 남의 주소를
 * 그대로 싣지 않는다 (초대 화면과 같은 규칙).
 *
 * ⚠️ **`??`가 아니라 공백 판정이다.** provider가 이름을 빈 문자열로 주면 `??`는 그것을 이름으로
 * 읽고, 호출부의 `{actor && …}`가 빈 문자열을 falsy로 접어 **셀 메타가 통째로 사라진다** —
 * 배지까지 함께 없어지는데 화면엔 오류가 없다.
 */
export function actorLabel(updatedBy: string | null, actors: ReadonlyMap<string, Actor>): string | null {
  if (!updatedBy) return null;
  const actor = actors.get(updatedBy);
  if (!actor) return updatedBy;
  const name = actor.name?.trim();
  return name ? name : maskEmail(actor.email);
}

/**
 * 테이블의 한 행. **로케일별 셀을 전부 들고 있다** — 화면이 `| key | en | ko | fr |`이므로
 * 행 하나가 모든 로케일을 그린다. 로케일마다 화면을 갈아타면 문맥이 끊긴다.
 */
export type KeyRow = {
  id: string;
  key: string;
  namespace: string;
  /** 키가 **처음 들어온** 시각. `?state=new`가 `Project.lastPulledAt`과 견준다. */
  createdAt: Date;

  description?: string | null;
  orphaned: boolean;
  /** 로케일 코드 → 셀. 없는 로케일은 미번역이다. */
  cells: Record<string, Cell | undefined>;
  refs: KeyRefRow[];
};

/**
 * 배지 상태. **우선순위가 있다** — `orphaned`가 전부를 이긴다(키 자체가 코드에서 사라졌으므로
 * 번역 상태를 논할 의미가 없다). `needsReview`는 값이 있을 때만 의미가 있다.
 */
export type TranslationState = "untranslated" | "translated" | "needsReview" | "orphaned";

export function translationState(input: {
  orphaned: boolean;
  value: string | null;
  needsReview: boolean;
}): TranslationState {
  if (input.orphaned) return "orphaned";
  // 빈 문자열도 미번역이다 — 편집 UI에서 값을 지우면 그렇게 들어온다.
  if (input.value === null || input.value === "") return "untranslated";
  return input.needsReview ? "needsReview" : "translated";
}

/**
 * 행에서 로케일 하나의 셀을 꺼낸다 — **`cells`를 직접 인덱싱하지 않는다.**
 *
 * ⚠️ **로케일 코드는 남이 정한 키다** (CLAUDE.md 코드 컨벤션이 `Locale.code`를 이름으로 든다).
 * 리포의 파일명에서 오고 `isPathSafeLocale`은 `constructor`·`toString`·`valueOf`를 통과시킨다 —
 * `_` 시작만 막으므로 `__proto__`만 걸린다. 그 이름들로 평범한 객체를 인덱싱하면
 * **`Object.prototype`의 값이 나오고 `cell !== undefined`가 통과한다.**
 *
 * ⚠️ **2026-09-18 재현에서 증상이 안 났지만 그것은 방어가 아니라 우연이었다** — 프로토타입에서
 * 찾아진 값에 `Cell`의 필드가 하나도 없어 `cell.pending`·`cell.value`가 전부 `undefined`로
 * 떨어졌을 뿐이다. `Cell`에 그 이름의 필드가 하나 생기면 끝나는 우연이라, 여기서 끊는다.
 * 대입 쪽 짝은 `lib/keys/query.ts`의 `Object.create(null)`이다.
 */
export function cellAt(row: KeyRow, locale: string): Cell | undefined {
  return Object.hasOwn(row.cells, locale) ? row.cells[locale] : undefined;
}

/** 행 + 로케일 → 배지 상태. 셀이 없으면 미번역이다. */
export function cellState(row: KeyRow, locale: string): TranslationState {
  const cell = cellAt(row, locale);
  return translationState({
    orphaned: row.orphaned,
    value: cell?.value ?? null,
    needsReview: cell?.needsReview ?? false,
  });
}

export type NamespaceCount = {
  namespace: string;
  total: number;
  untranslated: number;
  needsReview: number;
  orphaned: number;
};

/**
 * 보일 로케일의 후보 — `Locale` 행에서 오는 두 축뿐이다 (DESIGN §6.1).
 *
 * ⚠️ **코드 배열이 아니라 이 모양을 받는다.** 폴백이 orphaned를 빼야 하는데 코드만 받으면
 * 그 판정을 호출부가 하게 되고, 그러면 규칙이 화면 코드로 내려간다.
 */
export type LocaleOption = { code: string; orphaned: boolean };

/**
 * 키 하나의 상태를 **선택된 로케일 전체**로 판정한다 (DESIGN §6.1).
 *
 * ⚠️ **키 단위로 한 번만 센다.** 로케일마다 세면 집계의 합이 `total`을 넘어 드롭다운의
 * `pending/total`이 1을 넘는다. 우선순위는 `cellState`의 것을 그대로 쓴다
 * (orphaned > untranslated > needsReview).
 */
export function rowState(row: KeyRow, locales: readonly string[]): TranslationState {
  if (row.orphaned) return "orphaned";
  let needsReview = false;
  for (const code of locales) {
    const state = cellState(row, code);
    if (state === "untranslated") return "untranslated";
    if (state === "needsReview") needsReview = true;
  }
  return needsReview ? "needsReview" : "translated";
}

/**
 * 네임스페이스 드롭다운·섹션 헤딩의 집계 (8-4 — 옛 `namespaceCounts` 대체).
 *
 * ⚠️ **누산기가 `Map`이다** — 네임스페이스 이름이 리포의 키에서 온다(남이 정한 값).
 */
export function namespaceCountsFor(
  rows: readonly KeyRow[],
  locales: readonly string[],
): NamespaceCount[] {
  const byName = new Map<string, NamespaceCount>();

  for (const row of rows) {
    const entry = byName.get(row.namespace) ?? {
      namespace: row.namespace,
      total: 0,
      untranslated: 0,
      needsReview: 0,
      orphaned: 0,
    };
    entry.total += 1;
    const state = rowState(row, locales);
    if (state === "untranslated") entry.untranslated += 1;
    else if (state === "needsReview") entry.needsReview += 1;
    else if (state === "orphaned") entry.orphaned += 1;
    byName.set(row.namespace, entry);
  }

  // 어댑터 writer와 같은 규칙 — 재구현하지 않고 그 함수를 쓴다 (ARCHITECTURE §1.1).
  return [...byName.values()].sort((a, b) => compareKeys(a.namespace, b.namespace));
}

export type PermalinkProject = {
  repoOwner: string;
  repoName: string;
  lastCommitSha: string | null;
};

/**
 * GitHub 코드 참조 링크.
 *
 * @returns 커밋 SHA가 없으면 `null`. **브랜치명으로 대체하지 않는다** — 브랜치는 움직여서
 *   줄 번호가 어긋나고, 그러면 permalink의 요지가 사라진다.
 */
export function buildPermalink(project: PermalinkProject, ref: KeyRefRow): string | null {
  if (!project.lastCommitSha) return null;
  // 경로의 `/`는 디렉터리 구분자라 살리고, `[locale]` 같은 특수문자만 인코딩한다.
  const path = ref.path.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${project.repoOwner}/${project.repoName}/blob/${project.lastCommitSha}/${path}#L${ref.line}`;
}

/**
 * 착지할 네임스페이스 — **"남은 일이 있는" 첫 번째다** (DESIGN §6.1).
 *
 * `compareKeys` 첫 항목(알파벳순)으로 착지하면 이미 다 번역된 사소한 네임스페이스일 수 있고,
 * 그러면 편집자가 열 때마다 직접 찾아야 한다. 903키 프로젝트에서 그 비용이 매번 든다.
 *
 * ⚠️ **로케일을 인자로 받지 않는다** — `counts`가 이미 선택된 로케일 기준으로 만들어져 있다
 * (`namespaceCountsFor(rows, locales)`). 여기서 또 받으면 두 값이 갈릴 자리만 생긴다.
 * **6a T2의 판정이 8-4의 축 변경을 그대로 통과한 것**이 이 배치 덕이다.
 *
 * @returns 키가 없거나 전부 orphaned면 `null` — 화면이 빈 상태로 간다.
 */
export function defaultNamespace(counts: readonly NamespaceCount[]): string | null {
  // 정렬은 `namespaceCountsFor`가 이미 했다 — 여기서 다시 정렬하면 규칙이 두 벌이 된다.
  const pending = counts.find((c) => c.untranslated + c.needsReview > 0);
  if (pending) return pending.namespace;
  // 편집할 수 없는 화면에 착지시키지 않는다 — orphaned 셀은 disabled다 (DESIGN §6.1).
  return counts.find((c) => c.total > c.orphaned)?.namespace ?? null;
}

/**
 * `?ns=`의 해석. **`"*"`가 전체다** — 어댑터가 만들 수 없는 이름이라 실제 키 접두와 충돌하지 않는다
 * (`all`은 진짜 접두일 수 있다).
 *
 * ⚠️ **없는 이름을 404로 만들지 않는다.** 필터가 URL에 있고 링크는 오래 산다 — 네임스페이스가
 * 사라진 뒤 옛 링크를 열면 화면이 죽는 대신 기본 착지로 간다.
 */
export type NamespaceSelection =
  | { kind: "all" }
  | { kind: "one"; namespace: string }
  /** 착지할 곳이 없다 — 키가 없거나 전부 orphaned다. */
  | { kind: "none" };

export function resolveNamespace(
  param: string | undefined,
  counts: readonly NamespaceCount[],
): NamespaceSelection {
  if (param === ALL_NAMESPACES) return { kind: "all" };
  if (param !== undefined && counts.some((c) => c.namespace === param)) {
    return { kind: "one", namespace: param };
  }
  const fallback = defaultNamespace(counts);
  return fallback === null ? { kind: "none" } : { kind: "one", namespace: fallback };
}

export type RowFilter = {
  /** 보고 있는 로케일. **검색의 대상이 이 집합으로 좁혀진다** (아래). */
  locales: readonly string[];
  /** 키·**선택된 로케일 값**의 부분 일치(대소문자 무시). 편집자는 자기 언어로 찾는다. */
  q?: string;
};

/**
 * 툴바의 검색 필터. **서버 렌더 필터다** — URL이 상태라 공유되고 새로고침에 살아남는다.
 *
 * ⚠️ **검색 대상을 선택된 로케일로 좁힌다.** 안 좁히면 `?locales=ko`에서
 * **fr 값에 맞은 키가 아무 표시 없이 나타난다** — 옛 축에서는 전 로케일이 열로 보여서 어디가
 * 맞았는지 눈에 띄었지만 행 축에서는 그 값이 화면에 없다.
 *
 * 0행은 정상 결과다(화면이 "No keys match" 빈 상태를 낸다) — 여기서 폴백하지 않는다.
 */
export function filterRows(rows: readonly KeyRow[], filter: RowFilter): KeyRow[] {
  const needle = filter.q?.trim().toLowerCase() ?? "";
  if (needle === "") return [...rows];
  return rows.filter((row) => {
    const haystack = [row.key, ...filter.locales.map((code) => cellAt(row, code)?.value ?? "")];
    return haystack.some((text) => text.toLowerCase().includes(needle));
  });
}

/**
 * 파이프라인 구간으로 좁힌다 — Home의 카운트 카드 넷이 가리키는 자리다 (DESIGN §6.64).
 *
 * ⚠️ **술어를 새로 쓰지 않는다.** `unsent`는 `isUnpublished`, `review`·`untranslated`는
 * `cellState`다 — 카드의 수와 표의 행이 다른 규칙을 쓰면 "24라더니 9개뿐"이 **좁힘 때문인지
 * 정의 차이 때문인지** 화면에서 구별되지 않는다.
 *
 * ⚠️ **`new`만 로케일을 안 본다** — 단위가 셀이 아니라 키다. 나머지 셋은 **보고 있는
 * 로케일**에서만 판정한다: 안 보이는 로케일 때문에 걸린 행은 왜 걸렸는지 화면에 근거가 없다.
 *
 * ⚠️ **orphaned 키는 어느 구간도 아니다** — 편집이 막혀 있어 일이 아니고, `cellState`가 그것을
 * `orphaned`로 접어 자동으로 빠진다. `new`는 그 접기를 안 지나므로 여기서 직접 뺀다.
 *
 * ⚠️ **원본을 건드리지 않는다** — 호출부가 같은 배열로 총계도 센다.
 */
export function filterByState(
  rows: readonly KeyRow[],
  ctx: { state: KeyState; locales: readonly string[]; lastPulledAt: Date | null },
): KeyRow[] {
  return rows.filter((row) => {
    if (row.orphaned) return false;
    if (ctx.state === "new") return ctx.lastPulledAt === null || row.createdAt > ctx.lastPulledAt;
    return ctx.locales.some((code) => {
      if (ctx.state === "unsent") {
        const cell = cellAt(row, code);
        return cell !== undefined && isUnpublished(cell);
      }
      const state = cellState(row, code);
      return ctx.state === "review" ? state === "needsReview" : state === "untranslated";
    });
  });
}

/**
 * 섹션 안에서 **남은 일이 있는 키를 위로** 올린다 (8-4 — DESIGN §6.1).
 *
 * 상태 필터를 뺀 대가를 갚는 유일한 수단이다. 크롬 확장 `messages.json`은 구분자가 없어
 * 네임스페이스가 `_root` 하나이고(그게 이 도구의 1차 타깃이다), 그 프로젝트에서는 `pending/total`이
 * 전체 집계와 같아져 남은 일을 찾는 수단이 검색 하나가 된다.
 *
 * ⚠️ **정렬이 아니라 분할이다.** 같은 통 안의 순서를 **입력 그대로** 보존해야 하는데
 * (`compareKeys` 순서다), 비교 함수를 새로 쓰면 그 규칙이 두 벌이 된다.
 *
 * ⚠️ **orphaned 키는 pending이 아니다** — 편집할 수 없으므로 위로 올리면 거짓이다.
 *
 * ⚠️ **URL 상태가 아니다** — 칩이 넷째가 되지 않고 `?state=`가 되살아나지도 않는다.
 */
export function pendingFirst(rows: readonly KeyRow[], locales: readonly string[]): KeyRow[] {
  const pending: KeyRow[] = [];
  const rest: KeyRow[] = [];
  for (const row of rows) {
    const state = rowState(row, locales);
    if (state === "untranslated" || state === "needsReview") pending.push(row);
    else rest.push(row);
  }
  return [...pending, ...rest];
}

/** `?ns=*`의 섹션 하나 — 헤딩과 그 밑의 키 그룹들. */
export type NamespaceGroup = { namespace: string; rows: KeyRow[] };

/**
 * 전체 보기의 섹션 배열 (DESIGN §6.1).
 *
 * ⚠️ **순서를 `counts`에서 받는다.** `rows`만 보면 순서의 출처가 `loadKeys`의
 * `orderBy: { key: "asc" }`(Postgres collation)인데 집계가 쓰는 것은 `compareKeys`
 * (UTF-16 코드 유닛 비교)라 둘이 같다는 보장이 없다 — **섹션 헤딩 순서 ≠ 드롭다운 순서**가
 * 되고, 그것이 이 함수가 막으려던 바로 그 결과다.
 *
 * ⚠️ **누산기가 `Map`이다** — 평범한 `{}`에 `out["__proto__"] = v`를 하면 setter가 불려
 * own property가 안 생기고 **그 그룹이 조용히 사라진다** (POSTMORTEM 2026-09-09).
 *
 * 행이 하나도 없는 네임스페이스는 섹션이 되지 않는다 — 검색이 통째로 비운 경우다.
 */
export function groupByNamespace(
  rows: readonly KeyRow[],
  counts: readonly NamespaceCount[],
): NamespaceGroup[] {
  const byName = new Map<string, KeyRow[]>();
  for (const row of rows) {
    const bucket = byName.get(row.namespace);
    if (bucket === undefined) byName.set(row.namespace, [row]);
    else bucket.push(row);
  }

  const groups: NamespaceGroup[] = [];
  for (const count of counts) {
    const bucket = byName.get(count.namespace);
    if (bucket !== undefined) groups.push({ namespace: count.namespace, rows: bucket });
  }
  return groups;
}

/**
 * 아직 전달 확인되지 않은 편집인가 (sync-edit-protection T8). `pendingWhere`의 행 단위 형태다.
 *
 * ⚠️ **`surfaceArchivedAt`이 required다** — optional이던 동안 호출부가 안 실으면 보관 표면 셀도 셌다.
 * ⚠️ **시각·저자로 판정하지 않는다** — `lastPulledAt` 비교는 같은 밀리초 재저장을 못 가르고, Publish의 전달 확인은 토큰으로 한다.
 */
export function isUnpublished(cell: { pending: boolean; surfaceArchivedAt: Date | null }): boolean {
  return cell.pending && cell.surfaceArchivedAt === null;
}

/**
 * ⚠️ **`relativeTime`은 이 파일에 없다 — `lib/relative-time.ts`(잎)에 있다.** 클라이언트 컴포넌트
 * 둘(멤버 표·대기 초대)이 그것을 값으로 읽는데, **이 모듈은 잎이 아니다**(`compareKeys` 때문에
 * `lib/adapters/shared` → `json-style`을 문다). 여기서 재수출하면 그 그래프가 그대로 따라오므로
 * 재수출도 하지 않는다 — 서버 호출부도 잎을 직접 읽는다(클라이언트가 값으로 읽는 판정은 무거운 그래프를 물면 그대로 번들이 된다).
 */

/**
 * 로케일 하나의 진행 상태 (6b-5 — `/projects/:slug/locales`).
 *
 * ⚠️ **`total`이 로케일마다 같다.** 분모는 "살아 있는 키 수"이고 그것은 프로젝트 속성이다 —
 * 로케일마다 다른 것은 채워진 셀 수뿐이다.
 */
export type LocaleProgress = {
  code: string;
  isBase: boolean;
  orphaned: boolean;
  total: number;
  translated: number;
  needsReview: number;
  untranslated: number;
  /** 0~100. **내림이다** — 아래 함수 주석. */
  percent: number;
};

/**
 * 로케일별 진행률 (6b-5). **순수하다** — 분모·분자는 조회가 가져온다 (`loadLocaleCounts`).
 *
 * ⚠️ **`percent`가 내림이다.** 902/903을 100%로 보이면 "다 됐다"로 읽히고 그 하나가 영영 안 채워진다.
 * 100%는 실제로 전부일 때만 나온다.
 *
 * ⚠️ **base 로케일도 100%가 아닐 수 있다.** 그 파일이 키 집합의 진실이지만 값이 빈 키가 있을 수 있고
 * (POSTMORTEM 2026-09-09이 그 상태를 다뤘다), base 행을 무조건 100%로 그리면 화면이 거짓말을 한다.
 *
 * ⚠️ **`검토 필요`는 번역된 것이 아니다** — 원문이 바뀌어 사람이 다시 봐야 하는 값이라 `translated`와
 * 따로 센다. `namespaceCountsFor`가 같은 축을 쓴다.
 *
 * **순서가 화면의 정보구조다**: base가 먼저(나머지가 그것의 번역이다) → 살아 있는 로케일 코드순 →
 * orphaned 맨 뒤. 마지막 것은 행마다 사유 설명이 붙어서, 사이에 끼면 건강한 목록이 쪼개진다.
 */
export function localeProgress(input: {
  locales: readonly { code: string; isBase: boolean; orphaned: boolean }[];
  /** 살아 있는 키 수. orphaned 키는 export에서 빠지므로 번역해야 할 일이 아니다. */
  total: number;
  /** **값이 있는** 셀만. 죽은 키의 셀도 조회가 걸러 준다 — 안 걸러지면 분자가 분모보다 커진다. */
  cells: readonly { localeCode: string; needsReview: boolean }[];
}): LocaleProgress[] {
  const filled = new Map<string, { translated: number; needsReview: number }>();
  for (const locale of input.locales) filled.set(locale.code, { translated: 0, needsReview: 0 });

  for (const cell of input.cells) {
    // 목록에 없는 코드는 버린다 — 로케일 목록의 정본은 `Locale` 행이고 셀이 행을 지어내지 않는다.
    const entry = filled.get(cell.localeCode);
    if (entry === undefined) continue;
    if (cell.needsReview) entry.needsReview += 1;
    else entry.translated += 1;
  }

  const rows = input.locales.map((locale): LocaleProgress => {
    const { translated, needsReview } = filled.get(locale.code) ?? { translated: 0, needsReview: 0 };
    return {
      ...locale,
      total: input.total,
      translated,
      needsReview,
      untranslated: Math.max(0, input.total - translated - needsReview),
      // 0으로 나누지 않는다 — 첫 적재 전에는 키가 없다.
      percent: input.total <= 0 ? 0 : Math.min(100, Math.max(0, Math.floor((translated / input.total) * 100))),
    };
  });

  return rows.sort((a, b) => {
    // base는 orphaned여도 맨 앞이다 — "선언된 base"라는 사실이 그 상태보다 먼저다.
    if (a.isBase !== b.isBase) return a.isBase ? -1 : 1;
    if (a.orphaned !== b.orphaned) return a.orphaned ? 1 : -1;
    // 어댑터 writer와 같은 규칙 — 재구현하지 않고 그 함수를 쓴다 (ARCHITECTURE §1.1).
    return compareKeys(a.code, b.code);
  });
}
