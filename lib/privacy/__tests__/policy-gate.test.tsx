import { describe, expect, it } from "vitest";

import { en } from "@/messages/en";
import { koPrivacy } from "@/messages/ko-privacy";

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
 * 본문을 고쳤으면: 새 행 `{ effectiveDate: "<오늘>", digest: "<실패 메시지의 값>", koDigest: "<실패 메시지의 값>" }`를 끝에 붙이고,
 * `publicDocs.privacy.effectiveDate`와 `changes` 절의 목록에 같은 날짜를 적는다 — en 본과 ko 본(`messages/ko-privacy.tsx`) **둘 다**다.
 *
 * ⚠️ **ko 본은 2026-10-05부터다**(ui-locales design §8) — 그 전 행에는 `koDigest`가 없다. ko 본만 고쳐도 새 행이 필요하다(법적 문서다).
 */
const REVISIONS: readonly { effectiveDate: string; digest?: string; koDigest?: string }[] = [
  { effectiveDate: "2026-09-19" },
  { effectiveDate: "2026-09-24", digest: "4343d4fa724798db81c134a167f85b963f598199bb1fab0569d9dda6794b6963" },
  { effectiveDate: "2026-09-26", digest: "440e6802bea1828929a8f70aa81d2aed8e0a0a73f063ecdc95265e0671edb097" },
  { effectiveDate: "2026-09-27", digest: "d84367948c5659f424ca71196fde9be6762eeb6f235943e58429bb800930d008" },
  { effectiveDate: "2026-09-28", digest: "d793dcdfd5b28f80eb91bbf582665e411c02ca251514407398b84485d6d128be" },
  // mcp-connector — AI 에이전트 개인 토큰(해시·허용 동작·범위·사용 시각) · 에이전트가 읽는 것의 행방. 2026-09-28 초안이 v1.1.0 머지일로 옮겨졌다.
  { effectiveDate: "2026-09-29", digest: "e6c29b97727ea713450110a19f52138eb28b9f23fa2ad6b8bfd5d7954f1a9473" },
  // mcp-oauth — 브라우저 로그인으로 붙는 앱 연결(이름·주소·콜백·해시·허용 동작·범위·사용 시각) · 보존 · CIMD 문서 읽기. 같은 날 두 번째 개정이다 — 머지일이 바뀌면 날짜를 옮긴다.
  { effectiveDate: "2026-09-29", digest: "e335ec7a17858075cedf5f04e94f3fdbb25b93172d64d380f68516d74e6f8d61" },
  // ui-locales — 화면 언어(`User.uiLocale` · 쿠키 `malmoi-ui-locale`)와 ko 본 게시. 머지일이 바뀌면 날짜를 옮긴다.
  { effectiveDate: "2026-10-05", digest: "dbc15a7e6caa185de6b2d2a80f873d5eb7bbabfa9ab7886deaa7dd0167960ab0", koDigest: "5a47d4988e7046a3dcb898a8948d329e8d56ae88f89c011a1bf477885cc3dcdd" },
];

const privacy = en.publicDocs.privacy;
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

/**
 * **두 본의 동형** (ui-locales design §8) — ko 화면은 ko 본, en·es 화면은 en 본을 본다. 두 본이 다른 사실을 말하면 어느 쪽이 맞는지
 * 정하는 조항이 없으므로(spec 비목표) 같은 사실을 말하는 것을 게이트가 든다. 문장 대조는 사람(검수)의 몫이고, 여기는 구조를 센다.
 * `PrivacyBody` 타입이 표의 행 수·목록 항목 수를 이미 묶는다 — 아래는 그 위에 **값**이 같아야 하는 자리(id·날짜)를 잰다.
 */
describe("방침 두 본(en·ko) — 동형", () => {
  const ko = koPrivacy;
  const dates = (body: typeof ko | typeof privacy) => {
    const changes = body.sections.find((s) => s.id === "changes");
    const list = changes?.blocks.find((b) => "ul" in b);
    return list !== undefined && "ul" in list ? list.ul.map((item) => (typeof item === "string" ? /^\d{4}-\d{2}-\d{2}/.exec(item)?.[0] : undefined)) : [];
  };
  const table = (body: typeof ko | typeof privacy, id: string) => {
    const block = body.sections.find((s) => s.id === id)?.blocks.find((b) => "table" in b);
    return block !== undefined && "table" in block ? block.table : undefined;
  };

  it("절 id와 순서가 같다", () => {
    expect(ko.sections.map((s) => s.id)).toEqual(privacy.sections.map((s) => s.id));
  });

  it("시행일이 같다", () => {
    expect(ko.effectiveDate).toBe(privacy.effectiveDate);
  });

  it("개정 이력 항목 수와 날짜가 같다", () => {
    expect(dates(ko)).toEqual(dates(privacy));
    expect(dates(ko).every((date) => date !== undefined)).toBe(true);
  });

  it("수집 항목 표와 쿠키 표의 행·열 수가 같다", () => {
    for (const id of ["collected", "cookies"]) {
      const [a, b] = [table(ko, id), table(privacy, id)];
      expect(a?.rows.length, id).toBe(b?.rows.length);
      expect(a?.head.length, id).toBe(b?.head.length);
      for (const row of a?.rows ?? []) expect(row.length, id).toBe(a?.head.length);
    }
  });

  it("목차 짧은 라벨의 키(절 id)가 같다", () => {
    expect(Object.keys(ko.tocLabels)).toEqual(Object.keys(privacy.tocLabels));
  });

  it("등재(`collected.ts`) ↔ ko 본의 절도 맞는다", () => {
    const disclosed = Object.values(CLASSIFIED).filter((c) => c !== NOT_PERSONAL);
    expect(sectionGaps(disclosed, ko.sections, DISCLOSURE_SECTIONS)).toEqual({ missingSections: [], unusedSections: [], duplicateIds: [] });
  });

  it("ko 본이 비지 않았고, 해시가 마지막 개정의 ko 값과 같다 — ko 본만 고쳐도 새 개정 행이 필요하다", () => {
    const koText = docText(ko.sections);
    expect(koText.length).toBeGreaterThan(1500);
    expect(docDigest(koText)).toBe(REVISIONS.at(-1)?.koDigest);
  });
});
