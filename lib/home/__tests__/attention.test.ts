import { describe, expect, it } from "vitest";

import type { Actor } from "@/lib/keys/view";

import { attentionItems } from "../attention";

/**
 * `Needs your attention` — 세 종을 **한 시간축**에 세운다 (DESIGN §6.64).
 *
 * ⚠️ **캔버스 `2a`의 행 순서와 어긋나는 것이 의도다.** 캔버스는 파서 → 검토 → 미채움의 **종류 순**
 * 이었고 시간순이면 순서가 달라진다. 로그 카드와 같은 규칙을 쓰는 쪽을 골랐다 — 두 카드가 나란히
 * 서는 화면에서 정렬 규칙이 둘이면 사용자가 어느 쪽을 읽고 있는지 매번 다시 판단해야 한다.
 * `/design-sync`가 이것을 결함으로 잡지 않도록 `docs/DESIGN.md`에도 남긴다.
 */

const at = (iso: string): Date => new Date(iso);
const actors = new Map<string, Actor>([["u1", { id: "u1", name: "Kim", email: "kim@x.com" }]]);

const surfaces = [{ slug: "emails", importError: "parse-failed" as const, importing: false, lastImportFailedAt: at("2026-09-15T09:00:00Z") }];
const review = [{ surfaceSlug: "web", code: "ja", name: "Japanese", count: 8, at: at("2026-09-15T10:00:00Z"), updatedBy: "u1" }];
const neverFilled = [{ surfaceSlug: "web", code: "fr", name: "French", keys: 903, at: at("2026-09-11T00:00:00Z") }];

const base = { state: "default" as const, surfaces, review, neverFilled, actors };

describe("attentionItems — 시간순(최신)", () => {
  it("종류와 무관하게 최근 사건이 위다", () => {
    expect(attentionItems(base).shown.map((i) => i.kind)).toEqual(["review", "import_failed", "never_filled"]);
  });

  it("세 종이 각자 자기 재료를 든다", () => {
    const [first, second, third] = attentionItems(base).shown;
    expect(first).toEqual({ kind: "review", at: at("2026-09-15T10:00:00Z"), surfaceSlug: "web", code: "ja", name: "Japanese", count: 8, who: "Kim" });
    expect(second).toEqual({ kind: "import_failed", at: at("2026-09-15T09:00:00Z"), surfaceSlug: "emails", reason: "parse-failed" });
    expect(third).toEqual({ kind: "never_filled", at: at("2026-09-11T00:00:00Z"), surfaceSlug: "web", code: "fr", name: "French", keys: 903 });
  });

  /**
   * ⚠️ **`localeCompare`를 쓰지 않는다** — 로케일 설정에 따라 답이 달라져 같은 DB 상태가 다른 화면을
   * 낸다. `recentActivity`의 `compareEdit`·export 정렬과 같은 규칙이다 (ARCHITECTURE §1.1).
   */
  it("동점은 표면 → 로케일 코드 유닛 비교로 기울인다 — 입력 순서가 뒤바뀌어도 같다", () => {
    const same = at("2026-09-15T10:00:00Z");
    const rows = [
      { surfaceSlug: "web", code: "ja", name: "Japanese", count: 1, at: same, updatedBy: null },
      { surfaceSlug: "web", code: "de", name: "German", count: 1, at: same, updatedBy: null },
      { surfaceSlug: "emails", code: "zz", name: "Zz", count: 1, at: same, updatedBy: null },
    ];
    const order = (input: typeof rows) =>
      attentionItems({ ...base, surfaces: [], neverFilled: [], review: input }).shown.map((i) => `${i.surfaceSlug}:${"code" in i ? i.code : ""}`);
    expect(order(rows)).toEqual(["emails:zz", "web:de", "web:ja"]);
    expect(order([...rows].reverse())).toEqual(["emails:zz", "web:de", "web:ja"]);
  });

  /**
   * ⚠️ **에러는 있는데 시각이 `null`인 행은 마이그레이션 이전 행뿐이다** (ARCHITECTURE §5). 임의 위치를
   * 주면 배포 직후 목록이 흔들리므로 **가장 오래된 것으로 고정한다.**
   */
  it("실패 시각이 없는 옛 행은 가장 오래된 것으로 취급한다", () => {
    const items = attentionItems({
      ...base,
      surfaces: [{ slug: "emails", importError: "parse-failed", importing: false, lastImportFailedAt: null }],
    });
    expect(items.shown.map((i) => i.kind)).toEqual(["review", "never_filled", "import_failed"]);
    expect(items.shown[2]).toMatchObject({ kind: "import_failed", at: null });
  });
});

describe("attentionItems — 3행 + `+2 more`(상한 5)", () => {
  const many = Array.from({ length: 9 }, (_, i) => ({
    surfaceSlug: "web",
    code: `l${i}`,
    name: `L${i}`,
    count: 1,
    // 최신이 `l0`이다 — 잘린 뒤 무엇이 남았는지가 인덱스로 읽힌다.
    at: new Date(Date.UTC(2026, 8, 15 - i)),
    updatedBy: null,
  }));

  it("셋을 보이고 둘만 접는다 — 상한 5에서 잘린다", () => {
    const items = attentionItems({ ...base, surfaces: [], neverFilled: [], review: many });
    expect(items.shown).toHaveLength(3);
    expect(items.more).toHaveLength(2);
    expect(items.count).toBe(5);
    // 잘린 것은 오래된 쪽이다 — 최신 다섯이 남는다.
    expect([...items.shown, ...items.more].map((i) => ("code" in i ? i.code : ""))).toEqual(["l0", "l1", "l2", "l3", "l4"]);
  });

  it("셋 이하면 접을 것이 없다", () => {
    const items = attentionItems({ ...base, surfaces: [], neverFilled: [], review: many.slice(0, 2) });
    expect(items.shown).toHaveLength(2);
    expect(items.more).toEqual([]);
    expect(items.count).toBe(2);
  });

  it("아무것도 없으면 셋 다 비어 있다", () => {
    expect(attentionItems({ ...base, surfaces: [], review: [], neverFilled: [] })).toEqual({ shown: [], more: [], count: 0 });
  });
});

describe("attentionItems — 상태가 항목을 덜어낸다", () => {
  /** `2b`에서 배너가 그 표면의 소유자가 된다 — 같은 화면에 두 번 쓰지 않는다. */
  it("Sync 실패에서는 배너가 지목한 표면만 빠지고 카운트가 준다", () => {
    const normal = attentionItems(base);
    const failed = attentionItems({ ...base, state: "import_failed", bannerSurface: "emails" });
    expect(normal.count).toBe(3);
    expect(failed.count).toBe(2);
    expect(failed.shown.map((i) => i.kind)).toEqual(["review", "never_filled"]);
  });

  /**
   * ⚠️ **배너는 표면 하나만 말한다** (2026-09-15 리뷰 🟡6). 전에는 `2b`에서 파서 항목을 전부 버려서,
   * 표면 둘이 같은 Sync에서 깨지면 둘째가 배너에도 항목에도 없고 로그 한 줄로만 남았다 — 그 줄에는
   * `[Try again]`도 설정 링크도 없고 7일 창 밖이면 그것도 사라진다.
   */
  it("배너가 안 말한 실패는 항목으로 남는다", () => {
    const items = attentionItems({
      ...base,
      state: "import_failed",
      bannerSurface: "emails",
      surfaces: [
        { slug: "emails", importError: "parse-failed", importing: false, lastImportFailedAt: at("2026-09-15T09:00:00Z") },
        { slug: "web", importError: "parse-crashed", importing: false, lastImportFailedAt: at("2026-09-15T09:30:00Z") },
      ],
    });
    expect(items.shown.map((i) => i.kind)).toEqual(["review", "import_failed", "never_filled"]);
    expect(items.shown[1]).toMatchObject({ surfaceSlug: "web", reason: "parse-crashed" });
  });

  /** `2d`: 할 수 있는 일이 없다 — 항목 카드가 통째로 `EmptyState`다 (DESIGN §6.64). */
  it("보관에서는 항목이 하나도 서지 않는다", () => {
    expect(attentionItems({ ...base, state: "archived" })).toEqual({ shown: [], more: [], count: 0 });
  });

  /** 미연결은 반대다 — 번역·검토는 연결과 무관하게 할 수 있는 일이다. */
  it("미연결에서는 항목이 그대로다", () => {
    expect(attentionItems({ ...base, state: "not_connected" }).count).toBe(3);
  });

  /** 돌고 있는 중이면 남은 코드는 이전 실행의 것이다 — `failing`과 같은 판정이다. */
  it("다시 돌고 있는 표면은 항목을 만들지 않는다", () => {
    expect(attentionItems({
      ...base,
      surfaces: [{ slug: "emails", importError: "parse-failed", importing: true, lastImportFailedAt: at("2026-09-15T09:00:00Z") }],
    }).count).toBe(2);
  });
});

/**
 * ⚠️ **`actorLabel`의 `null`에 걸면 안 걸린다** (ARCHITECTURE §5) — 그 함수는 못 찾으면 `updatedBy` 원문을
 * 돌려주고, 2026-09-05 이후 행에서 그것은 cuid다. 화면에 cuid가 서는 것을 막는 판정은 **`actors`
 * 맵에 키가 있는지**뿐이다.
 */
describe("attentionItems — `last edited by` 폴백", () => {
  it("맵에 있는 사람은 라벨로 온다", () => {
    expect(attentionItems(base).shown[0]).toMatchObject({ who: "Kim" });
  });

  it("맵에 없으면 절이 통째로 빠진다 — cuid를 화면에 세우지 않는다", () => {
    const items = attentionItems({
      ...base,
      review: [{ ...review[0]!, updatedBy: "clh0000000000000000000000" }],
    });
    expect(items.shown[0]).toMatchObject({ kind: "review", who: null });
  });

  it("저자가 아예 없어도 항목은 남는다", () => {
    expect(attentionItems({ ...base, review: [{ ...review[0]!, updatedBy: null }] }).shown[0]).toMatchObject({ who: null });
  });
});
