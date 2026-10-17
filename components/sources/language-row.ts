import type { SourceDetail } from "@/lib/sources/query";

type LanguageRow = SourceDetail["languages"][number];

/**
 * 상세 모달이 말하는 언어 수 — **카드가 보이는 행 수**다(Adding·Removing·Inactive 포함 — 시안 L1·L5, DS #276·#277 · D14). 모달 설명 줄과 Languages 카드
 * 머리가 이 하나를 읽는다. ⚠️ 서버 `locales`(REMOVE를 뺀 작업 언어 수)는 Sources 목록 행·Home·Keys·Inbox 분모의 계약이라 그대로 둔다 — 모달 안에서만 행을 센다.
 */
export function listedLanguageCount(detail: Pick<SourceDetail, "languages">): number {
  return detail.languages.length;
}

/** 행 동작의 꺼짐 이유 — 앞선 것이 이긴다(기준 언어 > 권한 > 포맷 > 전달 미확정). 문장 자리는 이유마다 다르다(시안 L1·L3·L4). */
export type ActionBlock = "base" | "role" | "format" | "unconfirmed";

export type LanguageRowPlan = {
  badge: "adding" | "removing" | "removedFromRepository" | null;
  unsent: boolean;
  /** 마지막 Publish 링크 — 그 언어의 효과가 실렸다고 말할 수 있는 행(Adding·Removing + 전달됨)만이다. */
  link: boolean;
  notConfirmed: boolean;
  note: "baseRow" | "noFileYet" | "readOnly" | "notConfirmedHelp" | "publishToUpdate" | null;
  action: { kind: "add" | "remove" | "cancel"; block: ActionBlock | null };
};

/**
 * **Languages 카드 한 행의 판정** (locale-add E1 — 시안 L2·L3·L4). 상태는 동작 배지 셋(Adding · Removing · Inactive)과 전달 축(Unsent · PR 링크 ·
 * 확인 안 됨)의 조합이다 — "앱에서 요청함", "PR에 실음", "리포에 반영됨"을 같은 완료로 그리지 않는다.
 *
 * ⚠️ **PR 링크는 저장된 마지막 Publish 주소일 뿐이다**(R-E0 W4) — 열린 PR이라는 뜻도, 그 언어를 실었다는 뜻도 아니다. 그래서 링크는
 * 행 상태가 "전달됨"(Adding·Removing · `unsent: false` · 확인됨)일 때만 세운다. 값 0개 Adding은 파일을 낸 적이 없어 전달된 것이 없다.
 * ⚠️ **전달 확인이 안 된 동안 서버는 효과가 실렸을 수 있는 행의 취소만 막는다** — 값 있는 Adding의 추가 취소와 Removing의 제거 취소다.
 * 새 추가·제거는 막지 않는다(머리 [Add language]는 켜진 채).
 * ⚠️ **비지원 포맷은 새 추가·제거만 막는다** — 남은 Adding·Removing의 취소는 리포에 아무것도 보내지 않는 쪽이라 켠다(design §1 Y3).
 */
export function planLanguageRow(row: LanguageRow, input: { canManage: boolean; supported: boolean; unconfirmed: boolean }): LanguageRowPlan {
  const values = row.translated + row.needsReview;
  const block = (...reasons: (ActionBlock | false)[]): ActionBlock | null => reasons.find((reason): reason is ActionBlock => reason !== false) ?? null;
  const role = !input.canManage && "role";
  if (row.orphaned) {
    return { badge: "removedFromRepository", unsent: row.unsent, link: false, notConfirmed: false, note: row.unsent ? "publishToUpdate" : null,
      action: { kind: "add", block: block(role, !input.supported && "format") } };
  }
  if (row.change !== null) {
    const adding = row.change.operation === "ADD";
    const carried = !adding || values > 0;
    const unknown = input.unconfirmed && carried;
    return {
      badge: adding ? "adding" : "removing",
      unsent: !unknown && row.unsent,
      link: !unknown && !row.unsent && carried,
      notConfirmed: unknown,
      note: unknown ? "notConfirmedHelp" : !adding ? "readOnly" : !row.unsent && !carried ? "noFileYet" : null,
      action: { kind: adding ? "remove" : "cancel", block: block(role, unknown && "unconfirmed") },
    };
  }
  return { badge: null, unsent: row.unsent, link: false, notConfirmed: false, note: row.isBase ? "baseRow" : row.unsent ? "publishToUpdate" : null,
    action: { kind: "remove", block: block(row.isBase && "base", role, !input.supported && "format") } };
}
