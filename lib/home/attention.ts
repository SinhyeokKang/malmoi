import { actorLabel, type Actor } from "@/lib/keys/view";
import type { ImportFailureCode } from "@/lib/projects/import-status";
import { failing } from "@/lib/projects/list";

import type { HomeState } from "./state";

/**
 * `Needs your attention` — 세 종을 **한 시간축**에 세운다 (DESIGN §6.64 · ARCHITECTURE §5).
 *
 * ⚠️ **캔버스 `2a`의 행 순서와 어긋나는 것이 의도다.** 캔버스는 종류 순(파서 → 검토 → 미채움)이고
 * 이쪽은 시간순이다 — 로그 카드가 바로 옆에 서는데 두 카드의 정렬 규칙이 다르면 사용자가 어느 쪽을
 * 읽고 있는지 매번 다시 판단해야 한다. `/design-sync`가 결함으로 잡지 않도록 `docs/DESIGN.md`에도 있다.
 *
 * ⚠️ **수용한 대가**: 파서 실패가 오래됐으면 3행 밖으로 밀려 `+2 more` 뒤에 접힌다.
 */

/** 보이는 행 셋 + 접히는 둘. 상한 5는 캔버스가 정했다 — 목록이 아니라 **요약**이라서다. */
const VISIBLE = 3;
const CAP = 5;

export type AttentionItem =
  /**
   * ⚠️ **로케일을 모른다** — `lastImportError`가 표면 단위 컬럼이다. 캔버스의 `{surface} · {locale} file`
   * 에서 문장을 **표면까지로 낮춘다.**
   */
  | { kind: "import_failed"; at: Date | null; surfaceSlug: string; reason: ImportFailureCode }
  | { kind: "review"; at: Date; surfaceSlug: string; code: string; name: string; count: number; who: string | null }
  | { kind: "never_filled"; at: Date; surfaceSlug: string; code: string; name: string; keys: number };

export type AttentionList = {
  shown: AttentionItem[];
  /** `<details>` 안에 접히는 나머지. **클라이언트 상태가 0이다** (DESIGN §6.64). */
  more: AttentionItem[];
  /** 머리의 pill. 상한 5까지만 센다 — 세지 않은 것을 수로 말하지 않는다. */
  count: number;
};

export function attentionItems(input: {
  state: HomeState;
  surfaces: readonly { slug: string; importError: ImportFailureCode | null; importing: boolean; lastImportFailedAt: Date | null }[];
  review: readonly { surfaceSlug: string; code: string; name: string; count: number; at: Date; updatedBy: string | null }[];
  neverFilled: readonly { surfaceSlug: string; code: string; name: string; keys: number; at: Date }[];
  /** `actorLabel`이 보는 그 맵 그대로다 — 폴백 판정이 **키의 존재**를 봐야 한다. */
  actors: ReadonlyMap<string, Actor>;
  /** `2b`에서 배너가 지목한 표면. 그 하나만 목록에서 빠진다 — 나머지 실패는 남는다. */
  bannerSurface?: string | null;
}): AttentionList {
  // `2d`: 할 수 있는 일이 하나도 없다 — 항목 카드가 통째로 `EmptyState`다 (DESIGN §6.64).
  if (input.state === "archived") return { shown: [], more: [], count: 0 };

  const items: AttentionItem[] = [];
  /**
   * ⚠️ **배너가 지목한 표면 하나만 뺀다** (2026-09-15 리뷰 🟡6). 전에는 `2b`에서 파서 항목을 **전부**
   * 버렸는데, 배너는 표면 하나만 말한다 — 표면 둘이 같은 Sync에서 깨지면 둘째가 배너에도 항목에도
   * 없고 로그 한 줄로만 남았다. 그 줄에는 `[Try again]`도 설정 링크도 없고 7일 창 밖이면 사라진다.
   */
  for (const surface of input.surfaces) {
    // 돌고 있는 중이면 남은 코드는 이전 실행의 것이다 — 목록·설정과 **같은 술어**다.
    if (!failing(surface) || surface.importError === null) continue;
    // 배너가 이미 말한 표면은 같은 화면에서 두 번 말하지 않는다.
    if (input.state === "import_failed" && surface.slug === input.bannerSurface) continue;
    items.push({ kind: "import_failed", at: surface.lastImportFailedAt, surfaceSlug: surface.slug, reason: surface.importError });
  }
  for (const row of input.review) {
    items.push({ kind: "review", at: row.at, surfaceSlug: row.surfaceSlug, code: row.code, name: row.name, count: row.count, who: who(row.updatedBy, input.actors) });
  }
  for (const row of input.neverFilled) {
    items.push({ kind: "never_filled", at: row.at, surfaceSlug: row.surfaceSlug, code: row.code, name: row.name, keys: row.keys });
  }

  items.sort(compare);
  const capped = items.slice(0, CAP);
  return { shown: capped.slice(0, VISIBLE), more: capped.slice(VISIBLE), count: capped.length };
}

/**
 * ⚠️ **`actorLabel`의 `null`에 걸면 안 걸린다** (ARCHITECTURE §5). 그 함수는 못 찾으면 `updatedBy` 원문을
 * 돌려주고 2026-09-05 이후 행에서 그것은 cuid다 — 화면에 cuid가 서는 것을 막는 판정은 **맵에 키가
 * 있는지**뿐이다. 없으면 `— last edited by …` 절을 통째로 뺀다.
 */
function who(updatedBy: string | null, actors: ReadonlyMap<string, Actor>): string | null {
  // ⚠️ 맵을 복사하지 않는다 — 행마다 돌아 59로케일 × 표면 수만큼 복사가 생겼다 (2026-09-15 리뷰).
  return updatedBy === null || !actors.has(updatedBy) ? null : actorLabel(updatedBy, actors);
}

/**
 * ⚠️ **시각이 없는 항목은 가장 오래된 것이다** (ARCHITECTURE §5). 에러는 있는데 `lastImportFailedAt`이
 * `null`인 행은 마이그레이션 이전 행뿐이고, 임의 위치를 주면 배포 직후 목록이 흔들린다.
 *
 * ⚠️ **`localeCompare`를 쓰지 않는다** — 로케일 설정에 따라 답이 달라져 같은 DB 상태가 다른 화면을
 * 낸다. export 정렬과 같은 규칙이다 (ARCHITECTURE §1.1).
 */
function compare(a: AttentionItem, b: AttentionItem): number {
  // 시각 없는 항목끼리는 아래 보조 키로 갈린다 — 뺄셈으로 접으면 `-Infinity - -Infinity`가 NaN이다.
  if (a.at === null || b.at === null) {
    if (a.at !== b.at) return a.at === null ? 1 : -1;
  } else if (a.at.getTime() !== b.at.getTime()) {
    return b.at.getTime() - a.at.getTime();
  }
  if (a.surfaceSlug !== b.surfaceSlug) return a.surfaceSlug < b.surfaceSlug ? -1 : 1;
  // 파서 실패에는 로케일이 없다 — 빈 문자열이 같은 표면의 로케일 항목들보다 앞에 온다.
  const code = (item: AttentionItem): string => ("code" in item ? item.code : "");
  return code(a) === code(b) ? 0 : code(a) < code(b) ? -1 : 1;
}
