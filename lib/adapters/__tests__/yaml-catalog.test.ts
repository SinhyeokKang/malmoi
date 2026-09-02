import { describe, expect, it } from "vitest";
import { detectFormat, yamlCatalog } from "../index";
import type { AdapterFile, DetectedFormat } from "../types";

/**
 * `yaml-catalog` — `<dir>/{locale}.y(a)ml`. `per-locale` + **수술적 치환**이다.
 *
 * 오픈소스 109개에서 미지원 36개 중 **17개가 YAML**이었다 (mastodon 106로케일·decidim 82·
 * directus 69·redmine 50·misskey 42). 재생성으로 쓰면 Rails 로케일 파일의 주석·앵커·블록
 * 리터럴이 첫 pull에서 사라진다 — TS 딕셔너리에서 이미 겪은 구조 파괴다 (ARCHITECTURE §1.4).
 */

/** redmine·mastodon 형태 — 최상위가 로케일 코드 하나(Rails 관례) + 주석·빈 줄 */
const RAILS = `# Korean translations for Ruby on Rails
ko:
  direction: ltr
  common:
    ok: "확인"        # 줄 끝 주석
    close: 닫기

  # 의미 단위 주석
  time:
    just_now: 방금
    minutes_ago: "%{n}분 전"
`;

/** misskey·directus 형태 — 루트에 바로 키가 온다 */
const FLAT_ROOT = `---
_lang_: "한국어"
headline: "노트로 연결되는 네트워크"
nested:
  deep: "깊은 값"
`;

const f = (path: string, content: string): AdapterFile => ({ path, content });
const TMPL = "config/locales/{locale}.yml";
const base = (over: Partial<DetectedFormat> = {}): DetectedFormat => ({
  adapter: "yaml-catalog",
  pathTemplate: TMPL,
  locales: ["ko"],
  ...over,
});
const withSource = (content: string, path = "config/locales/ko.yml") =>
  base({ currentFiles: [{ path, content }] });

describe("yaml-catalog — 계약", () => {
  it("per-locale + surgical이다", () => {
    expect(yamlCatalog.layout).toBe("per-locale");
    expect(yamlCatalog.writeStrategy).toBe("surgical");
  });
});

describe("yaml-catalog — detect", () => {
  it("로케일 이름 YAML이 2개 이상인 디렉터리를 찾는다", () => {
    const d = yamlCatalog.detectCandidates([
      "config/locales/ko.yml",
      "config/locales/en.yml",
      "config/locales/ja.yml",
      "Gemfile",
    ]);
    expect(d[0]).toMatchObject({ adapter: "yaml-catalog", pathTemplate: "config/locales/{locale}.yml" });
    expect(d[0]?.locales.sort()).toEqual(["en", "ja", "ko"]);
  });

  it(".yaml 확장자도 받는다 (directus가 그렇다)", () => {
    const d = yamlCatalog.detectCandidates([
      "app/src/lang/translations/ko-KR.yaml",
      "app/src/lang/translations/en-US.yaml",
    ]);
    expect(d[0]?.pathTemplate).toBe("app/src/lang/translations/{locale}.yaml");
  });

  it("probe가 카탈로그 모양을 확인한다", () => {
    const paths = ["ci/ko.yml", "ci/en.yml"];
    expect(yamlCatalog.detectCandidates(paths, () => "- step: build\n- step: test\n")).toEqual([]);
    expect(yamlCatalog.detectCandidates(paths, () => FLAT_ROOT)).toHaveLength(1);
  });

  it("`.github/workflows`는 잡지 않는다 — 실측에서 이 오탐이 있었다", () => {
    expect(
      yamlCatalog.detectCandidates([".github/workflows/ko.yml", ".github/workflows/en.yml"], () => "on: push\n"),
    ).toEqual([]);
  });

  it("detectFormat이 chrome·json 다음에 YAML을 본다", () => {
    const d = detectFormat(["config/locales/ko.yml", "config/locales/en.yml"], () => RAILS);
    expect(d?.adapter).toBe("yaml-catalog");
  });
});

describe("yaml-catalog — read", () => {
  it("Rails식 로케일 루트 키를 벗기고 rootKeyed로 알린다", () => {
    const r = yamlCatalog.read(base(), [f("config/locales/ko.yml", RAILS)]);
    expect(r.errors).toEqual([]);
    expect(r.rootKeyedByPath).toEqual({ "config/locales/ko.yml": true });
    const keys = r.locales[0]!.entries.map((e) => e.key);
    expect(keys).toEqual(["common.close", "common.ok", "direction", "time.just_now", "time.minutes_ago"]);
    expect(r.locales[0]!.entries.find((e) => e.key === "common.ok")?.message).toBe("확인");
  });

  it("루트 키가 없는 형태도 읽는다", () => {
    const r = yamlCatalog.read(base({ locales: ["ko"] }), [f("config/locales/ko.yml", FLAT_ROOT)]);
    expect(r.rootKeyedByPath).toEqual({ "config/locales/ko.yml": false });
    expect(r.locales[0]!.entries.map((e) => e.key)).toEqual(["_lang_", "headline", "nested.deep"]);
  });

  it("문자열이 아닌 스칼라는 에러다 (read는 완화하지 않는다)", () => {
    const src = "ko:\n  n: 3\n  ok: \"확인\"\n  flag: true\n";
    const r = yamlCatalog.read(base(), [f("config/locales/ko.yml", src)]);
    expect(r.errors).toHaveLength(2);
    expect(r.locales[0]!.entries.map((e) => e.key)).toEqual(["ok"]);
  });

  it("알리아스는 리프로 세지 않는다 — 편집하면 앵커 관계가 깨진다", () => {
    const src = "ko:\n  a: &anc 앵커값\n  b: *anc\n";
    const r = yamlCatalog.read(base(), [f("config/locales/ko.yml", src)]);
    expect(r.locales[0]!.entries.map((e) => e.key)).toEqual(["a"]);
  });

  it("시퀀스는 인덱스 키로 펼친다", () => {
    const src = "ko:\n  list:\n    - 첫째\n    - 둘째\n";
    const r = yamlCatalog.read(base(), [f("config/locales/ko.yml", src)]);
    expect(r.locales[0]!.entries.map((e) => e.key)).toEqual(["list.0", "list.1"]);
  });

  it("깨진 YAML은 에러다", () => {
    const r = yamlCatalog.read(base(), [f("config/locales/ko.yml", "ko:\n  a: [unclosed\n")]);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe("yaml-catalog — write는 수술적이다", () => {
  it("값만 바뀌고 주석·빈 줄이 보존된다", () => {
    const out = yamlCatalog.write(withSource(RAILS), {
      locale: "ko",
      isBase: false,
      entries: [{ key: "common.ok", message: "OK로 변경" }],
    })!;
    expect(out).toContain("# Korean translations for Ruby on Rails");
    expect(out).toContain("# 줄 끝 주석");
    expect(out).toContain("# 의미 단위 주석");
    expect(out).toContain("OK로 변경");
    expect(out).not.toContain('"확인"');
    // 손 안 댄 줄은 그대로다
    expect(out).toContain("minutes_ago: \"%{n}분 전\"");
  });

  it("앵커·알리아스를 보존한다", () => {
    const src = "ko:\n  a: &anc 앵커값\n  b: *anc\n  c: 셋\n";
    const out = yamlCatalog.write(withSource(src), {
      locale: "ko",
      isBase: false,
      entries: [{ key: "c", message: "삼" }],
    })!;
    expect(out).toContain("&anc");
    expect(out).toContain("*anc");
    expect(out).toContain("삼");
  });

  it("바뀐 값이 없으면 원본을 바이트 그대로 돌려준다 (결정성의 근거)", () => {
    const out = yamlCatalog.write(withSource(RAILS), {
      locale: "ko",
      isBase: false,
      entries: [{ key: "common.ok", message: "확인" }],
    });
    expect(out).toBe(RAILS);
  });

  it("원본이 없으면 null — 파일을 새로 만들지 않는다", () => {
    expect(yamlCatalog.write(base(), { locale: "ko", isBase: false, entries: [{ key: "a", message: "A" }] })).toBeNull();
  });

  it("orphaned 키는 원본 값을 남긴다 (지우지 않는다)", () => {
    const out = yamlCatalog.write(withSource(RAILS), {
      locale: "ko",
      isBase: false,
      entries: [{ key: "common.ok", message: "새 DB 값", orphaned: true }],
    })!;
    expect(out).toContain('"확인"');
    expect(out).not.toContain("새 DB 값");
  });

  it("빈 값은 치환하지 않는다 — 소스에 빈 문자열이 박히면 폴백이 없다", () => {
    const out = yamlCatalog.write(withSource(RAILS), {
      locale: "ko",
      isBase: false,
      entries: [{ key: "common.ok", message: "" }],
    })!;
    expect(out).toContain('"확인"');
  });

  it("루트 키가 있는 파일에서 키 경로가 루트 아래로 들어간다", () => {
    const out = yamlCatalog.write(withSource(RAILS), {
      locale: "ko",
      isBase: false,
      entries: [{ key: "time.just_now", message: "지금" }],
    })!;
    expect(out).toContain("just_now: 지금");
    // 루트 키가 유지된다
    expect(out.startsWith("# Korean translations for Ruby on Rails\nko:")).toBe(true);
  });
});

describe("yaml-catalog — 없는 키를 삽입한다 (ARCHITECTURE §1.4)", () => {
  it("같은 맵에 없는 키를 추가한다", () => {
    const out = yamlCatalog.write(withSource(RAILS), {
      locale: "ko",
      isBase: false,
      entries: [{ key: "common.newKey", message: "새 값" }],
    })!;
    expect(out).toContain("newKey: 새 값");
    // 기존 주석은 그대로
    expect(out).toContain("# 의미 단위 주석");
  });

  it("중간 경로가 없으면 만든다", () => {
    const out = yamlCatalog.write(withSource(RAILS), {
      locale: "ko",
      isBase: false,
      entries: [{ key: "brand.new.deep", message: "깊은 새 값" }],
    })!;
    expect(out).toContain("깊은 새 값");
  });

  it("삽입 순서가 결정적이다 — 같은 입력이면 같은 바이트", () => {
    const entries = [
      { key: "common.zeta", message: "Z" },
      { key: "common.alpha", message: "A" },
    ];
    const a = yamlCatalog.write(withSource(RAILS), { locale: "ko", isBase: false, entries })!;
    const b = yamlCatalog.write(withSource(RAILS), { locale: "ko", isBase: false, entries: [...entries].reverse() })!;
    expect(b).toBe(a);
    // 코드포인트 순서로 들어간다
    expect(a.indexOf("alpha")).toBeLessThan(a.indexOf("zeta"));
  });

  it("루트 키가 없는 파일에도 삽입한다", () => {
    const out = yamlCatalog.write(withSource(FLAT_ROOT), {
      locale: "ko",
      isBase: false,
      entries: [{ key: "nested.added", message: "추가" }],
    })!;
    expect(out).toContain("added: 추가");
    expect(out).toContain("_lang_:");
  });
});

describe("yaml-catalog — 왕복", () => {
  for (const [name, src] of [["Rails 루트 키", RAILS], ["루트 키 없음", FLAT_ROOT]] as const) {
    it(`${name}: read→write→read가 의미 동일하고 2차 write가 바이트 고정점이다`, () => {
      const path = "config/locales/ko.yml";
      const r1 = yamlCatalog.read(base(), [f(path, src)]);
      const fmt1 = base({ currentFiles: [{ path, content: src }], rootKeyedByPath: r1.rootKeyedByPath });
      const w1 = yamlCatalog.write(fmt1, { locale: "ko", isBase: false, entries: r1.locales[0]!.entries })!;
      const r2 = yamlCatalog.read(base(), [f(path, w1)]);
      expect(r2.locales[0]!.entries).toEqual(r1.locales[0]!.entries);
      const w2 = yamlCatalog.write(
        base({ currentFiles: [{ path, content: w1 }], rootKeyedByPath: r2.rootKeyedByPath }),
        { locale: "ko", isBase: false, entries: r2.locales[0]!.entries },
      )!;
      expect(w2).toBe(w1);
    });
  }
});
