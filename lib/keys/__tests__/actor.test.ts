import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { actorLabel, collectActorIds, type Actor, type KeyRow } from "../view";

/**
 * 셀 메타의 편집자 표시 (malmoi#3).
 *
 * ⚠️ **`Translation.updatedBy`는 두 종류의 값이 섞인 컬럼이다** — 2026-09-05부터 `User.id`(cuid)이고
 * 그 전 행은 GitHub 핸들을 그대로 든다. 스키마가 FK를 걸지 않는 이유가 그것이라(`prisma/schema.prisma`),
 * **Prisma join으로는 풀 수 없다.** 그래서 판정이 두 갈래여야 한다: `User`를 찾으면 사람 이름,
 * 못 찾으면 **원문 그대로**. 못 찾은 값을 버리면 옛 행의 편집자가 화면에서 사라진다.
 */

function row(cells: Record<string, string | null>): KeyRow {
  return {
    id: "k1",
    key: "a.b",
    namespace: "a",
    orphaned: false,
    createdAt: new Date(0),
    refs: [],
    cells: Object.fromEntries(
      Object.entries(cells).map(([code, updatedBy]) => [code, { value: "v", needsReview: false, updatedBy, updatedAt: new Date("2026-09-01T00:00:00Z") }]),
    ),
  };
}

describe("collectActorIds — 조회할 식별자만 모은다", () => {
  it("중복을 접고 null을 버린다 — 왕복 하나에 필요한 최소 집합이다", () => {
    const ids = collectActorIds([row({ en: "u1", ko: "u1" }), row({ en: "u2", ko: null })]);
    expect([...ids].sort()).toEqual(["u1", "u2"]);
  });

  it("편집 이력이 없으면 빈 배열이다 — 호출부가 조회를 아예 건너뛸 수 있어야 한다", () => {
    expect(collectActorIds([row({ en: null })])).toEqual([]);
  });

  it("셀이 없는 로케일을 세지 않는다", () => {
    expect(collectActorIds([{ ...row({}), cells: { en: undefined } }])).toEqual([]);
  });
});

describe("actorLabel — User.id를 사람으로, 옛 핸들은 그대로", () => {
  const actors = new Map<string, Actor>([
    ["u1", { id: "u1", name: "강신혁", email: "sinhyeok@day1company.co.kr" }],
    ["u2", { id: "u2", name: null, email: "noname@example.com" }],
  ]);

  it("이름이 있으면 이름이다", () => {
    expect(actorLabel("u1", actors)).toBe("강신혁");
  });

  it("이름이 없으면 마스킹한 이메일이다 — 표를 보는 멤버 전원에게 남의 주소를 그대로 보이지 않는다", () => {
    expect(actorLabel("u2", actors)).toBe("n***@example.com");
  });

  it("⚠️ 이름이 빈 문자열이면 이메일로 내려간다 — `??`는 그것을 이름으로 읽어 셀 메타가 통째로 사라진다", () => {
    const blank = new Map<string, Actor>([["u3", { id: "u3", name: "  ", email: "blank@example.com" }]]);
    expect(actorLabel("u3", blank)).toBe("b***@example.com");
  });

  it("⚠️ 찾지 못한 값은 원문 그대로다 — 2026-09-05 이전 행의 GitHub 핸들이다", () => {
    expect(actorLabel("sinhyeokkang", actors)).toBe("sinhyeokkang");
  });

  it("지워진 User의 id도 원문으로 남는다 — cuid인지 판정해 버리지 않는다", () => {
    expect(actorLabel("clx0000000000000000000000", actors)).toBe("clx0000000000000000000000");
  });

  it("편집 이력이 없으면 null이다 — 셀에 아무것도 붙지 않는다", () => {
    expect(actorLabel(null, actors)).toBeNull();
  });

  it("빈 문자열도 null로 접는다 — `— `만 남은 꼬리를 그리지 않는다", () => {
    expect(actorLabel("", actors)).toBeNull();
  });
});

/**
 * ⚠️ **이 리포의 반복 실패 유형은 "만든 것이 실제로 호출되는가"다** .
 * `actorLabel`이 순수 함수로 green이어도 화면이 `updatedBy`를 그대로 찍으면 이슈는 그대로다 —
 * `query.ts`가 `server-only`라 렌더 테스트로 못 잡으므로 소스로 센다.
 */
describe("번역 화면이 원문 대신 해석한 라벨을 넘긴다", () => {
  const source = readFileSync(
    join(process.cwd(), "app/(edit)/projects/[slug]/surfaces/[surfaceSlug]/translations/page.tsx"),
    "utf8",
  );

  it("`loadActors`를 부른다 — 이름의 출처가 화면에 배선돼 있다", () => {
    // ⚠️ 이름만 찾으면 주석에 적어 놓은 것도 통과한다 — 호출 형태로 좁힌다.
    expect(source).toMatch(/loadActors\(/);
  });

  it("셀의 `updatedBy`를 CellMeta로 곧바로 넘기지 않는다", () => {
    expect(source).not.toMatch(/updatedBy=\{row\.cells/);
  });
});
