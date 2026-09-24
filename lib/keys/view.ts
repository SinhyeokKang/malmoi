import { compareKeys } from "@/lib/adapters/shared";
import { maskEmail } from "@/lib/auth/email";

/**
 * 번역 화면·Home·Sources가 함께 쓰는 순수 판정 — 편집자 라벨·permalink·로케일 진행률.
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
 * 조회를 좁히는 축이 `projectId`가 아니다 (POSTMORTEM 2026-09-06). 조회할 id는 호출부가
 * **이 프로젝트의 번역 행에서만** 모으므로 다른 테넌트의 사람이 들어오지 않는다(`loadActors`).
 */
export type Actor = {
  id: string;
  name: string | null;
  email: string;
};

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
 * 따로 센다.
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
