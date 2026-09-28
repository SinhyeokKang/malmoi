import { describe, expect, it } from "vitest";
import { jsonCatalog } from "../index";
import type { AdapterFile, DetectedFormat } from "../types";

/**
 * **키에 `.`이 들어 있을 때의 데이터 손실** — `json-catalog`의 유일한 손실 경로다
 * (ARCHITECTURE §1.35, `docs/ARCHITECTURE §1.9` §2).
 *
 * 오픈소스 109개에서 왕복 의미 불일치 2건이 났고 **둘 다 `read` 에러가 0**이었다. 뿌리는 하나다:
 * `.`가 우리 조인 구분자이면서 실제 키에 들어 있는 문자라 `flatten`/`setDeep`이 단사가 아니다.
 */

const f = (path: string, content: string): AdapterFile => ({ path, content });
const TMPL = "locales/{locale}.json";
const fmt = (over: Partial<DetectedFormat> = {}): DetectedFormat => ({
  adapter: "json-catalog",
  pathTemplate: TMPL,
  locales: ["en"],
  ...over,
});

describe("nested는 파일 단위로 관측한다 (musicblocks 손실의 증폭 요인)", () => {
  /**
   * musicblocks 실측: `th.json`은 최상위가 전부 문자열인데 **다른 로케일 파일**에 객체가 있어서
   * 포맷 전체가 nested로 판정되고 → th.json의 평평한 키까지 `.`으로 쪼개졌다.
   */
  const FLATFILE = JSON.stringify({ "Clear workspace": "지우기", "Clear workspace.": "지우기." }, null, 2) + "\n";
  const NESTEDFILE = JSON.stringify({ grp: { a: "A" } }, null, 2) + "\n";

  it("read가 파일별 nested를 돌려준다", () => {
    const r = jsonCatalog.read(fmt({ locales: ["en", "ko"] }), [
      f("locales/en.json", NESTEDFILE),
      f("locales/ko.json", FLATFILE),
    ]);
    expect(r.nestedByPath).toEqual({ "locales/en.json": true, "locales/ko.json": false });
  });

  it("포맷 단위 `nested`는 하위 호환으로 남는다 (어느 파일이든 중첩이면 true)", () => {
    const r = jsonCatalog.read(fmt({ locales: ["en", "ko"] }), [
      f("locales/en.json", NESTEDFILE),
      f("locales/ko.json", FLATFILE),
    ]);
    expect(r.nested).toBe(true);
  });

  it("평평한 파일은 다른 파일이 중첩이어도 평평하게 쓴다 — 이게 손실을 막는다", () => {
    const r = jsonCatalog.read(fmt({ locales: ["en", "ko"] }), [
      f("locales/en.json", NESTEDFILE),
      f("locales/ko.json", FLATFILE),
    ]);
    const koEntries = r.locales.find((l) => l.locale === "ko")!.entries;
    const out = jsonCatalog.write(
      fmt({ nested: true, nestedByPath: r.nestedByPath, locales: ["en", "ko"] }),
      { locale: "ko", entries: koEntries },
    )!;
    const back = JSON.parse(out) as Record<string, unknown>;
    // 두 키가 **둘 다** 살아 있어야 한다
    expect(back["Clear workspace"]).toBe("지우기");
    expect(back["Clear workspace."]).toBe("지우기.");
  });
});

describe("접두 충돌은 조용히 삼키지 않고 에러로 보고한다 (siyuan 손실)", () => {
  /** siyuan 실측 형태: 중첩 객체 안의 키가 점을 품어 `a.b`와 `a.b.c`가 함께 나온다. */
  const CLASH = JSON.stringify({ grp: { "task.database": "얕은쪽", "task.database.index": "깊은쪽" } }, null, 2) + "\n";

  it("read는 둘 다 읽는다 (평탄화 목록에서는 서로 다른 키다)", () => {
    const r = jsonCatalog.read(fmt(), [f("locales/en.json", CLASH)]);
    const keys = r.locales[0]!.entries.map((e) => e.key);
    expect(keys).toContain("grp.task.database");
    expect(keys).toContain("grp.task.database.index");
  });

  it("write가 충돌을 에러로 알린다 — 어느 키에서 잃었는지 알려주는 것이 최소 조건이다", () => {
    const r = jsonCatalog.read(fmt(), [f("locales/en.json", CLASH)]);
    const res = jsonCatalog.writeWithErrors!(fmt({ nested: true }), {
      locale: "en",
      entries: r.locales[0]!.entries,
    });
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.errors.map((e) => e.key)).toContain("grp.task.database");
    expect(res.errors.map((e) => e.code)).toContain("key-shadowed");
  });

  it("충돌해도 깊은 쪽을 살린다 — 문자열 자리를 객체로 덮는 대신 얕은 쪽을 건너뛴다", () => {
    const r = jsonCatalog.read(fmt(), [f("locales/en.json", CLASH)]);
    const out = jsonCatalog.write(fmt({ nested: true }), {
      locale: "en",
      entries: r.locales[0]!.entries,
    })!;
    const back = JSON.parse(out) as { grp: { task: { database: { index: string } } } };
    expect(back.grp.task.database.index).toBe("깊은쪽");
  });

  it("충돌이 없으면 에러도 없다 (과다 보고하지 않는다)", () => {
    const ok = JSON.stringify({ grp: { "a.b": "X", "a.c": "Y" } }, null, 2) + "\n";
    const r = jsonCatalog.read(fmt(), [f("locales/en.json", ok)]);
    const res = jsonCatalog.writeWithErrors!(fmt({ nested: true }), {
      locale: "en",
      entries: r.locales[0]!.entries,
    });
    expect(res.errors).toEqual([]);
  });

  it("왕복이 선다 — 접두 충돌이 있는 파일도 2차 read가 1차와 의미 동일하다(얕은 쪽 제외)", () => {
    const r1 = jsonCatalog.read(fmt(), [f("locales/en.json", CLASH)]);
    const w = jsonCatalog.write(fmt({ nested: true }), {
      locale: "en",
      entries: r1.locales[0]!.entries,
    })!;
    const r2 = jsonCatalog.read(fmt({ nested: true }), [f("locales/en.json", w)]);
    // **제목의 축이다** (launch-readiness L4.3) — 전에는 아래 바이트 고정점만 봐서, 2차 read가 무엇을 잃어도
    // 두 write가 같으면 green이었다. 얕은 쪽 하나만 빠지고 나머지는 키·값 그대로여야 한다.
    const semantic = (r: typeof r1) => r.locales[0]!.entries.map((e) => [e.key, e.message]);
    expect(semantic(r2)).toEqual(semantic(r1).filter(([key]) => key !== "grp.task.database"));
    expect(semantic(r2)).toEqual([["grp.task.database.index", "깊은쪽"]]);
    const w2 = jsonCatalog.write(fmt({ nested: true }), {
      locale: "en",
      entries: r2.locales[0]!.entries,
    })!;
    // 바이트 고정점 — 2차 write가 1차와 같다
    expect(w2).toBe(w);
  });
});

/**
 * **평탄·중첩 충돌은 read가 보고한다** (launch-readiness L1.4 · audit #20). write는 접두 충돌을 `key-shadowed`로
 * 알리는데 read는 같은 평탄 키가 두 경로에서 나와도 조용히 둘 다 실었다 — 뒤의 `lastWins`가 하나를 버리고,
 * 어느 값이 DB에 남았는지 아무도 모른다.
 */
describe("평탄·중첩 충돌은 read가 duplicate-key로 보고한다", () => {
  it("같은 평탄 키가 두 경로에서 나오면 에러 + 마지막이 이긴다", () => {
    const src = JSON.stringify({ errors: { messages: { blank: "a" } }, "errors.messages.blank": "b" }, null, 2) + "\n";
    const res = jsonCatalog.read(fmt(), [f("locales/en.json", src)]);
    expect(res.errors).toContainEqual({ path: "locales/en.json", code: "duplicate-key", key: "errors.messages.blank" });
    const hits = res.locales[0]!.entries.filter((e) => e.key === "errors.messages.blank");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.message).toBe("b");
  });

  it("충돌이 없으면 에러 0 (짝)", () => {
    const src = JSON.stringify({ errors: { messages: { blank: "a" } }, "errors.messages.other": "b" }, null, 2) + "\n";
    const res = jsonCatalog.read(fmt(), [f("locales/en.json", src)]);
    expect(res.errors).toEqual([]);
    expect(res.locales[0]!.entries).toHaveLength(2);
  });
});

describe("json-catalog read — nestedByPath는 프로토타입 없는 객체다 (audit #84)", () => {
  it("경로 키 대입이 Object.prototype의 setter를 타지 않는다", () => {
    const r = jsonCatalog.read({ adapter: "json-catalog", pathTemplate: "l/{locale}.json", locales: ["en"] }, [{ path: "l/en.json", content: '{"a":"b"}' }]);
    expect(Object.getPrototypeOf(r.nestedByPath)).toBeNull();
    expect(r.nestedByPath).toEqual(Object.assign(Object.create(null) as object, { "l/en.json": false }));
  });
});

/**
 * **빈 객체 `{}`는 중첩의 증거가 아니다** (malmoi#147). 재생성 어댑터는 표현을 원본에서 읽지만, 항목이 0개인 파일은 중첩인지 평평한지 말하지
 * 않는다 — 그 파일을 "평평하다"로 관측하면 중첩 표면의 로케일 파일에 `"menu.openFile"`이 최상위 점 키로 나간다. 그 `{}`는 Malmoi 자신이
 * 마지막 값을 비울 때 쓴 것(`emptyCatalog`)이라 흔한 경로다. `{}`가 실제로 말하는 표현(줄바꿈·BOM)은 그대로 원본을 따른다.
 */
describe("json-catalog — 빈 {} 로케일 파일은 표면의 nested를 따른다 (malmoi#147)", () => {
  const NESTED_EN = JSON.stringify({ menu: { openFile: "Open file" } }, null, 2) + "\n";
  const FLAT_EN = JSON.stringify({ "menu.openFile": "Open file", title: "Title" }, null, 2) + "\n";
  const entries = [{ key: "menu.openFile", message: "Ouvrir" }];
  const both = fmt({ locales: ["en", "fr"] });

  it("read가 {}의 중첩 여부를 관측값으로 남기지 않는다 — 형제의 관측은 그대로", () => {
    const r = jsonCatalog.read(both, [f("locales/en.json", NESTED_EN), f("locales/fr.json", "{}\r\n")]);
    expect(r.nestedByPath).toEqual({ "locales/en.json": true });
    expect(r.nested).toBe(true);
  });

  it("중첩 표면 + {} 원본 → 중첩으로 쓰고 원본의 CRLF는 유지한다", () => {
    const r = jsonCatalog.read(both, [f("locales/en.json", NESTED_EN), f("locales/fr.json", "{}\r\n")]);
    const out = jsonCatalog.write(fmt({ locales: ["en", "fr"], nested: r.nested, nestedByPath: r.nestedByPath, currentFiles: [f("locales/fr.json", "{}\r\n")] }), { locale: "fr", entries });
    expect(out).toBe('{\r\n  "menu": {\r\n    "openFile": "Ouvrir"\r\n  }\r\n}\r\n');
  });

  it("⚠️ 저장된 옛 관측(`{}` → false)이 남아 있어도 원본이 {}면 표면의 nested를 따른다 — 이미 적재된 프로젝트", () => {
    const out = jsonCatalog.write(fmt({ locales: ["en", "fr"], nested: true, nestedByPath: { "locales/en.json": true, "locales/fr.json": false },
      currentFiles: [f("locales/fr.json", "{}\n")] }), { locale: "fr", entries });
    expect(JSON.parse(out!)).toEqual({ menu: { openFile: "Ouvrir" } });
  });

  it("평평한 표면 + {} 원본 → 평평하게 쓴다 (짝)", () => {
    const r = jsonCatalog.read(both, [f("locales/en.json", FLAT_EN), f("locales/fr.json", "{}\n")]);
    expect(r.nested).toBe(false);
    const out = jsonCatalog.write(fmt({ locales: ["en", "fr"], nested: r.nested, nestedByPath: r.nestedByPath, currentFiles: [f("locales/fr.json", "{}\n")] }), { locale: "fr", entries });
    expect(JSON.parse(out!)).toEqual({ "menu.openFile": "Ouvrir" });
  });

  it("점 키를 이미 가진 평평한 파일은 중첩 표면에서도 평평하게 쓴다 — 파일별 규칙은 그대로 (짝, §1.35)", () => {
    const flatFr = JSON.stringify({ "menu.openFile": "Ouvrir" }, null, 2) + "\n";
    const r = jsonCatalog.read(both, [f("locales/en.json", NESTED_EN), f("locales/fr.json", flatFr)]);
    const out = jsonCatalog.write(fmt({ locales: ["en", "fr"], nested: r.nested, nestedByPath: r.nestedByPath, currentFiles: [f("locales/fr.json", flatFr)] }), { locale: "fr", entries });
    expect(JSON.parse(out!)).toEqual({ "menu.openFile": "Ouvrir" });
  });

  it("왕복 — 비움(emptyCatalog) → 다시 채움 → 읽기가 같은 키·같은 모양이고 결정적이다", () => {
    const format = (fr: string) => {
      const r = jsonCatalog.read(both, [f("locales/en.json", NESTED_EN), f("locales/fr.json", fr)]);
      return fmt({ locales: ["en", "fr"], nested: r.nested, nestedByPath: r.nestedByPath, currentFiles: [f("locales/fr.json", fr)] });
    };
    const nestedFr = '{\n  "menu": {\n    "openFile": "Ouvrir"\n  }\n}\n';
    const emptied = jsonCatalog.write(format(nestedFr), { locale: "fr", entries: [] })!;
    expect(emptied).toBe("{}\n");
    const refilled = jsonCatalog.write(format(emptied), { locale: "fr", entries })!;
    expect(refilled).toBe(nestedFr);
    expect(jsonCatalog.write(format(emptied), { locale: "fr", entries })).toBe(refilled);
    const back = jsonCatalog.read(both, [f("locales/fr.json", refilled)]);
    expect(back.locales[0]?.entries.map(e => [e.key, e.message])).toEqual([["menu.openFile", "Ouvrir"]]);
    expect(back.nestedByPath).toEqual({ "locales/fr.json": true });
  });
});
