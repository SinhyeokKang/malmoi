import { describe, expect, it } from "vitest";

import { m } from "@/lib/i18n";

import { CLASSIFIED, DISCLOSURE_SECTIONS, NOT_PERSONAL } from "../collected";
import { sectionGaps } from "../disclosure";
import { docDigest, docText } from "../doc-text";

/**
 * **방침 실물의 게이트** (privacy design §2.2 (B)(C)).
 *
 * (B) 등재(`collected.ts`) ↔ 본문의 절 — 양방향이고 **대조 단위는 절 id다**.
 * (C) 본문 ↔ 개정 이력 — 본문을 바꾸면 아래 `REVISIONS`에 행을 하나 더 써야 green이고, 그 행에 날짜를
 *     타이핑하는 것이 곧 시행일 갱신이다. **"해시만 갱신하고 날짜는 두는" 탈출구가 닫힌다.**
 *
 * ⚠️ **git log로 대신하지 않는다** — CI 체크아웃이 깊이 1이라 파일 이력이 없어 조용히 통과하거나 깨진다.
 * ⚠️ 첫 판(2026-09-19)은 이 게이트 전이라 해시가 없다 — 이력의 날짜만 든다.
 *
 * 본문을 고쳤으면: 새 행 `{ effectiveDate: "<오늘>", digest: "<실패 메시지의 값>" }`를 끝에 붙이고,
 * `publicDocs.privacy.effectiveDate`와 `changes` 절의 목록에 같은 날짜를 적는다.
 */
const REVISIONS: readonly { effectiveDate: string; digest?: string }[] = [
  { effectiveDate: "2026-09-19" },
  { effectiveDate: "2026-09-24", digest: "4343d4fa724798db81c134a167f85b963f598199bb1fab0569d9dda6794b6963" },
];

const privacy = m.publicDocs.privacy;
const text = docText(privacy.sections);

describe("방침 게이트 (B) — 등재 ↔ 본문의 절", () => {
  it("등재가 가리키는 절이 전부 있고, 대상 절이 전부 쓰이고, 절 id가 겹치지 않는다", () => {
    const disclosed = Object.values(CLASSIFIED).filter((c) => c !== NOT_PERSONAL);
    expect(sectionGaps(disclosed, privacy.sections, DISCLOSURE_SECTIONS)).toEqual({
      missingSections: [],
      unusedSections: [],
      duplicateIds: [],
    });
  });

  it("절 일곱이 전부 있다 — 다른 화면이 앵커로 가리킨다", () => {
    expect(privacy.sections.map((s) => s.id)).toEqual(["collected", "purposes", "retention", "third-parties", "deletion", "cookies", "changes"]);
  });

  it("모든 표의 행이 머리와 셀 수가 같다 — 실물의 셀 누락은 픽스처 단언이 못 본다", () => {
    for (const section of privacy.sections) {
      for (const block of section.blocks) {
        if (!("table" in block)) continue;
        for (const row of block.table.rows) expect(row.length, `${section.id}: ${block.table.label}`).toBe(block.table.head.length);
      }
    }
  });
});

describe("방침 게이트 (C) — 본문 ↔ 개정 이력", () => {
  it("본문이 비지 않았다 — 빈 본문을 해시해도 green이 되면 게이트가 아니다", () => {
    expect(text.length).toBeGreaterThan(3000);
  });

  it("현재 본문의 해시가 마지막 개정의 것과 같다 — 다르면 본문이 바뀐 것이고 새 개정 행이 필요하다", () => {
    expect(docDigest(text)).toBe(REVISIONS.at(-1)?.digest);
  });

  it("시행일이 마지막 개정의 날짜다", () => {
    expect(privacy.effectiveDate).toBe(REVISIONS.at(-1)?.effectiveDate);
  });

  it("개정마다 changes 절에 그 날짜가 적혀 있다 — 배열만 갱신하면 화면의 이력에 개정이 없다", () => {
    const changes = privacy.sections.find((s) => s.id === "changes");
    const changesText = docText(changes === undefined ? [] : [changes]);
    for (const revision of REVISIONS) expect(changesText).toContain(revision.effectiveDate);
  });
});
