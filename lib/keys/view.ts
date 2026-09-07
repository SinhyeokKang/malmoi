import { compareKeys } from "@/lib/adapters/shared";
import { maskEmail } from "@/lib/auth/email";

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
  value: string | null;
  needsReview: boolean;
  updatedBy: string | null;
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
export function actorLabel(updatedBy: string | null, actors: Map<string, Actor>): string | null {
  if (!updatedBy) return null;
  const actor = actors.get(updatedBy);
  if (!actor) return updatedBy;
  const name = actor.name?.trim();
  return name ? name : maskEmail(actor.email);
}

/**
 * 테이블의 한 행. **로케일별 셀을 전부 들고 있다** — 화면이 `| key | en | ko | fr |`이므로
 * 행 하나가 모든 로케일을 그린다. 로케일마다 화면을 갈아타면 문맥이 끊긴다 (MVP §3.2).
 */
export type KeyRow = {
  id: string;
  key: string;
  namespace: string;

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

/** 행 + 로케일 → 배지 상태. 셀이 없으면 미번역이다. */
export function cellState(row: KeyRow, locale: string): TranslationState {
  const cell = row.cells[locale];
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
 * 사이드바 집계. **어느 로케일 기준인지 받아야 한다** — 테이블이 로케일을 열로 펼치므로
 * "일이 얼마나 남았나"가 로케일마다 다르다. 총 개수만으로는 알 수 없다.
 */
export function namespaceCounts(rows: readonly KeyRow[], locale: string): NamespaceCount[] {
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
    const state = cellState(row, locale);
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
