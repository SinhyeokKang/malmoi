import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
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
    // 루트 키 관측은 계약에 실리지 않는다 — write가 원본에서 직접 본다 (2026-09-04 audit #47).
    expect(r.locales[0]?.entries.some((e) => e.key.startsWith("common."))).toBe(true);
    const keys = r.locales[0]!.entries.map((e) => e.key);
    expect(keys).toEqual(["common.close", "common.ok", "direction", "time.just_now", "time.minutes_ago"]);
    expect(r.locales[0]!.entries.find((e) => e.key === "common.ok")?.message).toBe("확인");
  });

  it("루트 키가 없는 형태도 읽는다", () => {
    const r = yamlCatalog.read(base({ locales: ["ko"] }), [f("config/locales/ko.yml", FLAT_ROOT)]);
    expect(r.locales[0]?.entries.some((e) => e.key === "headline")).toBe(true);
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
      entries: [{ key: "common.ok", message: "OK로 변경" }],
    })!;
    expect(out).toContain("# Korean translations for Ruby on Rails");
    expect(out).toContain("# 줄 끝 주석");
    expect(out).toContain("# 의미 단위 주석");
    expect(out).toContain("OK로 변경");
    expect(out).not.toContain('"확인"');
    // 손 안 댄 줄은 그대로다
    expect(out).toContain("minutes_ago: \"%{n}분 전\"");
    // 이름이 "빈 줄이 보존된다"인데 빈 줄을 안 보고 있었다 (2026-09-04 audit #24).
    expect(out.split("\n").filter((l) => l.trim() === "").length).toBe(RAILS.split("\n").filter((l) => l.trim() === "").length);
  });

  it("앵커·알리아스를 보존한다", () => {
    const src = "ko:\n  a: &anc 앵커값\n  b: *anc\n  c: 셋\n";
    const out = yamlCatalog.write(withSource(src), {
      locale: "ko",
      entries: [{ key: "c", message: "삼" }],
    })!;
    expect(out).toContain("&anc");
    expect(out).toContain("*anc");
    expect(out).toContain("삼");
  });

  it("바뀐 값이 없으면 원본을 바이트 그대로 돌려준다 (결정성의 근거)", () => {
    const out = yamlCatalog.write(withSource(RAILS), {
      locale: "ko",
      entries: [{ key: "common.ok", message: "확인" }],
    });
    expect(out).toBe(RAILS);
  });

  it("원본이 없으면 null — 파일을 새로 만들지 않는다", () => {
    expect(yamlCatalog.write(base(), { locale: "ko", entries: [{ key: "a", message: "A" }] })).toBeNull();
  });

  it("orphaned 키는 원본 값을 남긴다 (지우지 않는다)", () => {
    const out = yamlCatalog.write(withSource(RAILS), {
      locale: "ko",
      entries: [{ key: "common.ok", message: "새 DB 값", orphaned: true }],
    })!;
    expect(out).toContain('"확인"');
    expect(out).not.toContain("새 DB 값");
  });

  it("빈 값은 치환하지 않는다 — 소스에 빈 문자열이 박히면 폴백이 없다", () => {
    const out = yamlCatalog.write(withSource(RAILS), {
      locale: "ko",
      entries: [{ key: "common.ok", message: "" }],
    })!;
    expect(out).toContain('"확인"');
  });

  it("루트 키가 있는 파일에서 키 경로가 루트 아래로 들어간다", () => {
    const out = yamlCatalog.write(withSource(RAILS), {
      locale: "ko",
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
      entries: [{ key: "common.newKey", message: "새 값" }],
    })!;
    expect(out).toContain("newKey: 새 값");
    // 기존 주석은 그대로
    expect(out).toContain("# 의미 단위 주석");
  });

  /**
   * ⚠️ **중간 맵을 만들지 않는다** (launch-readiness L4.3 — 옛 제목 "중간 경로가 없으면 만든다"는 구현과 반대였다).
   * 가장 깊이 존재하는 맵 아래에 남은 경로를 **점 키 리터럴 하나**로 넣는다 — 조회도 같은 걷기라(L1.4) 다음 write가
   * 그 리터럴을 찾아 중복을 만들지 않는다. 옛 단언(값이 어딘가에 있다)은 두 모양을 가르지 못했다.
   */
  it("중간 경로가 없으면 가장 깊은 기존 맵에 점 키 리터럴로 넣는다", () => {
    const out = yamlCatalog.write(withSource(RAILS), {
      locale: "ko",
      entries: [{ key: "brand.new.deep", message: "깊은 새 값" }],
    })!;
    expect(out).toMatch(/^  brand\.new\.deep: 깊은 새 값$/m);
    expect(out).not.toMatch(/^\s*brand:\s*$/m);
    const again = yamlCatalog.write(withSource(out), { locale: "ko", entries: [{ key: "brand.new.deep", message: "깊은 새 값" }] })!;
    expect(again).toBe(out);
  });

  it("삽입 순서가 결정적이다 — 같은 입력이면 같은 바이트", () => {
    const entries = [
      { key: "common.zeta", message: "Z" },
      { key: "common.alpha", message: "A" },
    ];
    const a = yamlCatalog.write(withSource(RAILS), { locale: "ko", entries })!;
    const b = yamlCatalog.write(withSource(RAILS), { locale: "ko", entries: [...entries].reverse() })!;
    expect(b).toBe(a);
    // 코드 유닛 순서로 들어간다 (`compareKeys`)
    expect(a.indexOf("alpha")).toBeLessThan(a.indexOf("zeta"));
  });

  it("루트 키가 없는 파일에도 삽입한다", () => {
    const out = yamlCatalog.write(withSource(FLAT_ROOT), {
      locale: "ko",
      entries: [{ key: "nested.added", message: "추가" }],
    })!;
    // 형제 `deep: "깊은 값"`의 인용을 따른다 (audit #56).
    expect(out).toContain('added: "추가"');
    expect(out).toContain("_lang_:");
  });
});

describe("yaml-catalog — 왕복", () => {
  for (const [name, src] of [["Rails 루트 키", RAILS], ["루트 키 없음", FLAT_ROOT]] as const) {
    it(`${name}: read→write→read가 의미 동일하고 2차 write가 바이트 고정점이다`, () => {
      const path = "config/locales/ko.yml";
      const r1 = yamlCatalog.read(base(), [f(path, src)]);
      const fmt1 = base({ currentFiles: [{ path, content: src }] });
      const w1 = yamlCatalog.write(fmt1, { locale: "ko", entries: r1.locales[0]!.entries })!;
      const r2 = yamlCatalog.read(base(), [f(path, w1)]);
      expect(r2.locales[0]!.entries).toEqual(r1.locales[0]!.entries);
      const w2 = yamlCatalog.write(
        base({ currentFiles: [{ path, content: w1 }] }),
        { locale: "ko", entries: r2.locales[0]!.entries },
      )!;
      expect(w2).toBe(w1);
    });
  }
});

/**
 * ⚠️ **중복 키 하나로 62로케일 카탈로그를 버렸다** (CitizensFoundation/your-priorities 실측).
 *
 * `yaml`은 `Map keys must be unique`를 **에러**로 보고한다. 그걸 그대로 "카탈로그 아님"으로 읽으면
 * 데이터 흠 하나가 리포 전체를 탐지에서 지운다 — JSON 쪽에서 이미 고친 것과 같은 부류다
 * (`catalogVerdict`의 3값 완화). 중복은 **보고하되 막지 않는다.**
 */
describe("yaml-catalog — 중복 키는 보고하고 계속한다", () => {
  const DUP = "ko:\n  a: 첫째\n  b: 둘째\n  a: 셋째\n";

  it("중복 키가 있어도 탐지된다", () => {
    const found = yamlCatalog.detectCandidates(["config/locales/ko.yml", "config/locales/en.yml"], () => DUP);
    expect(found).toHaveLength(1);
  });

  it("중복 키를 에러로 보고한다 — 값 하나가 사라지는 건 사실이다", () => {
    const r = yamlCatalog.read(base(), [f("config/locales/ko.yml", DUP)]);
    expect(r.errors.map((e) => e.code)).toContain("duplicate-key");
    // 남은 키는 읽힌다 — 리포 전체를 버리지 않는다
    expect(r.locales[0]?.entries.map((e) => e.key)).toEqual(["a", "b"]);
  });

  it("진짜 구문 오류는 여전히 막는다 (완화가 관문을 없앤 건 아니다)", () => {
    const broken = "ko:\n  a: [unclosed\n";
    expect(yamlCatalog.detectCandidates(["c/ko.yml", "c/en.yml"], () => broken)).toEqual([]);
    const r = yamlCatalog.read(base(), [f("config/locales/ko.yml", broken)]);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

/**
 * ⚠️ **중복 키에서 read와 write가 다른 항목을 잡으면 결정성이 깨진다** (solidusio/solidus_i18n 실측 —
 * 중복 23건, 2,513키, 바이트 고정점 실패).
 *
 * YAML 로더는 **마지막이 이긴다.** read가 그 규칙을 따르는데 write가 첫 항목을 고치면:
 * 1. 2차 write가 1차와 달라져 결정성이 깨지고(매일 밤 무의미한 커밋),
 * 2. 더 나쁘게 **앱이 보는 값과 우리가 고친 값이 달라 번역이 조용히 무효가 된다.**
 */
describe("yaml-catalog — 중복 키에서 read와 write가 같은 항목을 잡는다", () => {
  const DUP = "ko:\n  a: 첫째\n  b: 둘째\n  a: 셋째\n";

  it("read는 마지막 값을 읽는다 (YAML 로더와 같다)", () => {
    const r = yamlCatalog.read(base(), [f("config/locales/ko.yml", DUP)]);
    expect(r.locales[0]?.entries.find((e) => e.key === "a")?.message).toBe("셋째");
  });

  it("write도 마지막 항목을 고친다 — 첫 항목을 고치면 앱이 보는 값이 안 바뀐다", () => {
    const out = yamlCatalog.write(withSource(DUP), {
      locale: "ko",
      entries: [{ key: "a", message: "바뀐값" }],
    })!;
    // 마지막 `a`가 바뀌어야 한다
    expect(out).toContain("a: 첫째");
    expect(out).toContain("a: 바뀐값");
  });

  it("바이트 고정점이 성립한다 (2차 write = 1차 write)", () => {
    const path = "config/locales/ko.yml";
    const r1 = yamlCatalog.read(base(), [f(path, DUP)]);
    const w1 = yamlCatalog.write(base({ currentFiles: [{ path, content: DUP }] }), {
      locale: "ko",
      entries: r1.locales[0]!.entries,
    })!;
    const r2 = yamlCatalog.read(base(), [f(path, w1)]);
    const w2 = yamlCatalog.write(base({ currentFiles: [{ path, content: w1 }] }), {
      locale: "ko",
      entries: r2.locales[0]!.entries,
    })!;
    expect(w2).toBe(w1);
  });
});

/**
 * ⚠️ **시퀀스 값을 write가 못 찾으면 키를 하나 더 만들어낸다** (directus/directus 실측 — 70로케일 중
 * 4개에서 바이트 고정점 실패).
 *
 * `read`는 시퀀스를 `key.0`으로 펼친다. write가 그 경로를 맵으로만 걸으면 못 찾고 **없는 키로
 * 판정해 리터럴 `"key.0"`을 새로 삽입**한다 → 원본 시퀀스와 중복이 되고, 2차 write가 다른 항목을
 * 잡아 값이 진동한다. 긴 문자열이면 접힘 위치까지 달라져 diff가 매일 밤 새로 뜬다.
 */
describe("yaml-catalog — 시퀀스 값도 제자리에서 고친다", () => {
  const SEQ = "ko:\n  list:\n    - 첫째\n    - 둘째\n  note:\n    - 긴 문장 하나\n";

  it("시퀀스 항목을 치환한다 (새 키를 만들지 않는다)", () => {
    const out = yamlCatalog.write(withSource(SEQ), {
      locale: "ko",
      entries: [{ key: "list.1", message: "둘째 바뀜" }],
    })!;
    expect(out).toContain("- 둘째 바뀜");
    // 리터럴 `"list.1"` 키를 새로 만들지 않았다
    expect(out).not.toContain("list.1:");
    // 시퀀스 모양이 유지된다
    expect(out).toContain("  list:");
  });

  it("왕복 2층이 성립한다", () => {
    const path = "config/locales/ko.yml";
    const r1 = yamlCatalog.read(base(), [f(path, SEQ)]);
    const w1 = yamlCatalog.write(base({ currentFiles: [{ path, content: SEQ }] }), {
      locale: "ko",
      entries: r1.locales[0]!.entries,
    })!;
    const r2 = yamlCatalog.read(base(), [f(path, w1)]);
    expect(r2.locales[0]!.entries).toEqual(r1.locales[0]!.entries);
    const w2 = yamlCatalog.write(base({ currentFiles: [{ path, content: w1 }] }), {
      locale: "ko",
      entries: r2.locales[0]!.entries,
    })!;
    expect(w2).toBe(w1);
  });

  it("긴 문자열을 바꿔도 2차 write가 고정점이다 (접힘 위치가 흔들리지 않는다)", () => {
    const path = "config/locales/ko.yml";
    const long = "매우 긴 문장이며 " + "단어 ".repeat(30) + "끝";
    const w1 = yamlCatalog.write(base({ currentFiles: [{ path, content: SEQ }] }), {
      locale: "ko",
      entries: [{ key: "note.0", message: long }],
    })!;
    const r2 = yamlCatalog.read(base(), [f(path, w1)]);
    const w2 = yamlCatalog.write(base({ currentFiles: [{ path, content: w1 }] }), {
      locale: "ko",
      entries: r2.locales[0]!.entries,
    })!;
    expect(w2).toBe(w1);
  });
});

describe("yaml-catalog — 표현은 원본에서 (ARCHITECTURE §1.4)", () => {
  it("편집하지 않은 80자 넘는 plain 스칼라는 접히지 않고 그대로 남는다", () => {
    const long = "이 문장은 여든 글자를 넘기기 위해 " + "단어 ".repeat(40) + "끝";
    const src = `ko:\n  short: 짧다\n  long: ${long}\n`;
    const out = yamlCatalog.write(withSource(src), {
      locale: "ko",
      entries: [{ key: "short", message: "바뀜" }],
    })!;
    expect(out.split("\n")).toContain(`  long: ${long}`);
  });

  it("4칸 들여쓰기 파일은 편집 뒤에도 4칸이다 — 값 하나 바꾸는데 파일 전체가 재들여쓰기되면 안 된다", () => {
    const src = `ko:\n    common:\n        ok: 확인\n        close: 닫기\n`;
    const out = yamlCatalog.write(withSource(src), {
      locale: "ko",
      entries: [{ key: "common.ok", message: "OK" }],
    })!;
    expect(out).toBe(`ko:\n    common:\n        ok: OK\n        close: 닫기\n`);
  });

  it("writeWithErrors — 원본이 파싱되지 않으면 원본을 돌려주되 에러로 알린다", () => {
    const res = yamlCatalog.writeWithErrors!(withSource("ko:\n  a: [unclosed\n"), {
      locale: "ko",
      entries: [{ key: "a", message: "x" }],
    });
    expect(res.content).toBe("ko:\n  a: [unclosed\n");
    expect(res.errors).toHaveLength(1);
  });
});

describe("yaml-catalog — 키 단위 스킵도 보고한다 (2026-09-04 audit #4)", () => {
  it("알리아스 자리는 건드리지 않되 에러로 남긴다 — 앵커 관계가 깨지므로 건너뛰는 건 맞다", () => {
    const src = "ko:\n  base: &a 기준\n  ref: *a\n";
    const res = yamlCatalog.writeWithErrors!(withSource(src), {
      locale: "ko",
      entries: [{ key: "ref", message: "새 값" }],
    });
    expect(res.content).toBe(src);
    expect(res.errors.some((e) => e.code === "write-slot-not-scalar" && e.key === "ref")).toBe(true);
  });

  it("맵 자리에 스칼라를 쓰려 하면 포기하되 에러로 남긴다", () => {
    const src = "ko:\n  grp:\n    inner: 값\n";
    const res = yamlCatalog.writeWithErrors!(withSource(src), {
      locale: "ko",
      entries: [{ key: "grp", message: "스칼라로 덮으려 한다" }],
    });
    expect(res.content).toBe(src);
    expect(res.errors.some((e) => e.code === "write-slot-not-scalar" && e.key === "grp")).toBe(true);
  });

  it("정상 치환에는 에러가 없다", () => {
    const res = yamlCatalog.writeWithErrors!(withSource(RAILS), {
      locale: "ko",
      entries: [{ key: "common.ok", message: "OK" }],
    });
    expect(res.errors).toEqual([]);
  });
});

describe("yaml-catalog — 시퀀스 들여쓰기도 원본에서 (2026-09-04 7차 측정)", () => {
  /**
   * `yaml`의 `indentSeq` 기본값이 true라 `- item`을 부모 키보다 한 단 들여쓴다. Rails 로케일
   * 파일은 부모와 **같은 열**에 쓰므로, 키 하나를 편집하면 그 파일의 모든 시퀀스 줄이 밀린다.
   *
   * 7차 재측정의 새 지표(1키 편집 → hunk 수)가 이걸 잡았다 — yaml 리포 29개 중 9개에서 hunk가
   * 1이 아니었다(redmine 28 · search-gov 37 · diaspora 21 · your-priorities 20). 들여쓰기 폭과
   * 줄 접기를 고친 뒤에도 남아 있던 축이다.
   */
  const SEQ_FLUSH = "ko:\n  greeting: 안녕\n  items:\n  - 하나\n  - 둘\n";
  const SEQ_INDENTED = "ko:\n  greeting: 안녕\n  items:\n    - 하나\n    - 둘\n";

  it("부모와 같은 열에 쓴 시퀀스는 그대로 남는다 — 편집한 줄만 바뀐다", () => {
    const out = yamlCatalog.write(withSource(SEQ_FLUSH), {
      locale: "ko",
      entries: [{ key: "greeting", message: "안녕하세요" }],
    })!;
    expect(out).toBe("ko:\n  greeting: 안녕하세요\n  items:\n  - 하나\n  - 둘\n");
  });

  it("들여쓴 시퀀스는 들여쓴 채로 남는다 — 반대 방향으로도 보존한다", () => {
    const out = yamlCatalog.write(withSource(SEQ_INDENTED), {
      locale: "ko",
      entries: [{ key: "greeting", message: "안녕하세요" }],
    })!;
    expect(out).toBe("ko:\n  greeting: 안녕하세요\n  items:\n    - 하나\n    - 둘\n");
  });

  it("시퀀스가 없으면 판정이 출력에 영향을 주지 않는다", () => {
    const src = "ko:\n  a: 하나\n  b: 둘\n";
    const out = yamlCatalog.write(withSource(src), {
      locale: "ko",
      entries: [{ key: "a", message: "일" }],
    })!;
    expect(out).toBe("ko:\n  a: 일\n  b: 둘\n");
  });
});

describe("yaml-catalog — 플로우 컬렉션 여백도 원본에서 (2026-09-04 7차 측정)", () => {
  it("여백 없는 플로우 컬렉션은 그대로 남는다 — `yaml` 기본값이 여백을 넣는다", () => {
    const src = "ko:\n  greeting: 안녕\n  day_names: [일, 월, 화]\n";
    const out = yamlCatalog.write(withSource(src), {
      locale: "ko",
      entries: [{ key: "greeting", message: "안녕하세요" }],
    })!;
    expect(out).toBe("ko:\n  greeting: 안녕하세요\n  day_names: [일, 월, 화]\n");
  });

  it("여백을 둔 파일은 여백을 유지한다", () => {
    const src = "ko:\n  greeting: 안녕\n  day_names: [ 일, 월, 화 ]\n";
    const out = yamlCatalog.write(withSource(src), {
      locale: "ko",
      entries: [{ key: "greeting", message: "안녕하세요" }],
    })!;
    expect(out).toBe("ko:\n  greeting: 안녕하세요\n  day_names: [ 일, 월, 화 ]\n");
  });
});


describe("yaml-catalog — 원본의 인용 부호를 유지한다", () => {
  // 픽스처가 큰따옴표뿐이라 이 축이 검증되지 않았다 (2026-09-04 audit #25). code-dict·ts-dict는
  // 양쪽 픽스처가 있는데 YAML만 빠져 있었다 — POSTMORTEM 2026-09-03이 "yaml은 CST 노드가 부호를
  // 든다"고 근거를 댔는데 그것을 단언하는 테스트가 없었다.
  const SINGLE = `ko:
  common:
    ok: '확인'
    close: '닫기'
`;

  it("작은따옴표 원본에서 값을 바꿔도 작은따옴표다", () => {
    const out = yamlCatalog.write(withSource(SINGLE), {
      locale: "ko",
      entries: [{ key: "common.ok", message: "확인!" }],
    })!;
    expect(out).toContain("ok: '확인!'");
    expect(out).toContain("close: '닫기'");
    expect(out).not.toContain('"확인!"');
  });
});

describe("yaml-catalog — T12 편집 범위 밖 바이트 보존", () => {
  const source = `# Japanese\nsettings:\n  help: >\n    2行にわたる折りたたみスカラー。\n    この形が往復で保たれる必要がある。\nerrors:\n  unknown:   '古い値'  # keep\n`;

  it("다른 키를 편집해도 미편집 folded scalar와 정렬 공백을 그대로 둔다", () => {
    const input = { locale: "ko", entries: [{ key: "errors.unknown", message: "新しい値" }] };
    const expected = source.replace("'古い値'", "'新しい値'");
    const output = yamlCatalog.write(withSource(source), input)!;
    expect(output).toBe(expected);
    expect(yamlCatalog.read(base(), [f("config/locales/ko.yml", output)]).locales[0]?.entries)
      .toContainEqual(input.entries[0]);
    expect(yamlCatalog.write(withSource(source), input)).toBe(output);
    expect(yamlCatalog.write(withSource(output), input)).toBe(output);
  });

  it("누락 키 삽입도 기존 folded scalar와 바이트를 바꾸지 않는다", () => {
    const input = { locale: "ko", entries: [{ key: "errors.added", message: "追加" }] };
    const output = yamlCatalog.write(withSource(source), input)!;
    // 형제 `unknown: '古い値'`의 인용을 따른다 (audit #56).
    expect(output).toBe(source + "  added: '追加'\n");
    expect(yamlCatalog.read(base(), [f("config/locales/ko.yml", output)]).locales[0]?.entries)
      .toContainEqual(input.entries[0]);
    expect(yamlCatalog.write(withSource(source), input)).toBe(output);
    expect(yamlCatalog.write(withSource(output), input)).toBe(output);
  });
});

describe("yaml-catalog — range 치환 경계", () => {
  const cases = [
    ["앵커·태그·주석", "a: &ref !!str 'old'   # keep\nb: *ref\n", "a", "new", "a: &ref !!str 'new'   # keep\nb: *ref\n"],
    ["CRLF·끝 개행 없음", "a: old\r\nb:   'keep'", "a", "new", "a: new\r\nb:   'keep'"],
    ["flow 시퀀스", "a: [old,  'keep'] # tail\n", "a.0", "x, y", 'a: ["x, y",  \'keep\'] # tail\n'],
    ["flow 맵", "a: {x: old,  y: 'keep'}\n", "a.x", "new", "a: {x: new,  y: 'keep'}\n"],
    ["리터럴 키 우선", "a.b: old\na:\n  b: keep\n", "a.b", "new", "a.b: new\na:\n  b: keep\n"],
    ["중복 마지막", "a: 'keep'\na:   old # tail\n", "a", "new", "a: 'keep'\na:   new # tail\n"],
    ["빈 scalar 주석", "a:   # keep\nb: next\n", "a", "new", "a:   new # keep\nb: next\n"],
    ["빈 scalar 공백 없음", "a:\nb: next\n", "a", "new", "a: new\nb: next\n"],
    ["명시적 블록 들여쓰기", "a: >2-  # header\n  old\nb: keep\n", "a", "new", "a: >2-  # header\n  new\nb: keep\n"],
    ["블록 clip", "a: | # header\n    old\nb: keep\n", "a", "new\n", "a: | # header\n    new\nb: keep\n"],
    ["블록 strip 변경", "a: > # header\n  old\nb: keep\n", "a", "new", "a: >- # header\n  new\nb: keep\n"],
    ["블록 keep·CRLF", "a: |+ # header\r\n  old\r\n\r\nb: keep\r\n", "a", "new\n\n", "a: |+ # header\r\n  new\r\n\r\nb: keep\r\n"],
  ] as const;
  for (const [name, source, key, message, expected] of cases) {
    it(`${name}: 편집 범위 외 보존·의미·결정성·고정점`, () => {
      const input = { locale: "ko", entries: [{ key, message }] };
      const result = yamlCatalog.writeWithErrors!(withSource(source), input);
      expect(result.errors).toEqual([]);
      expect(result.content).toBe(expected);
      const read = yamlCatalog.read(base(), [f("config/locales/ko.yml", result.content!)]);
      expect(read.errors.filter((error) => error.code !== "duplicate-key")).toEqual([]);
      if (name === "리터럴 키 우선") expect(parseDocument(result.content!).get(key)).toBe(message);
      else expect(read.locales[0]?.entries).toContainEqual({ key, message });
      expect(yamlCatalog.write(withSource(source), input)).toBe(result.content);
      expect(yamlCatalog.write(withSource(result.content!), input)).toBe(result.content);
    });
  }
  for (const message of ["true", "null", "123", "a: b", "# head", "a\nb", " a\n\n", "quote ' slash \\"]) {
    it(`스칼라 값 ${JSON.stringify(message)}의 타입과 의미를 보존한다`, () => {
      for (const source of ["a: old\nb: keep\n", "a: 'old'\nb: keep\n", "a: >- # header\n    old\nb: keep\n", "a: [old, keep]\n"]) {
        const key = source.includes("[old") ? "a.0" : "a";
        const input = { locale: "ko", entries: [{ key, message }] };
        const output = yamlCatalog.write(withSource(source), input)!;
        const read = yamlCatalog.read(base(), [f("config/locales/ko.yml", output)]);
        expect(read.errors).toEqual([]);
        expect(read.locales[0]?.entries).toContainEqual({ key, message });
        expect(yamlCatalog.write(withSource(output), input)).toBe(output);
      }
    });
  }
});

describe("yaml-catalog — 원본 보존 삽입 경계", () => {
  const cases = [
    ["중첩 맵·다음 주석", "a:\n    x: old # keep\n\n# next\nb: keep\n", "a.z", "a:\n    x: old # keep\n    z: new\n\n# next\nb: keep\n"],
    ["루트 로케일·문서 끝", "---\nko:\n  x: old\n...\n", "z", "---\nko:\n  x: old\n  z: new\n...\n"],
    ["중복 맵의 마지막", "a:\n  x: first\na:\n  x: last\n", "a.z", "a:\n  x: first\na:\n  x: last\n  z: new\n"],
    ["flow 맵", "a: {x: old} # keep\n", "a.z", "a: {x: old, z: new} # keep\n"],
    ["flow 끝 쉼표", "a: {x: old, } # keep\n", "a.z", "a: {x: old, z: new, } # keep\n"],
    ["빈 flow 맵", "a: {} # keep\n", "a.z", "a: {z: new} # keep\n"],
    ["CRLF·끝 개행 없음", "x: old\r\ny: keep", "z", "x: old\r\ny: keep\r\nz: new"],
    ["없는 경로는 리터럴 키", "x: old\n", "a.z", "x: old\na.z: new\n"],
  ] as const;
  for (const [name, source, key, expected] of cases) {
    it(`${name}: 삽입 이외 바이트·의미·결정성·고정점`, () => {
      const input = { locale: "ko", entries: [{ key, message: "new" }] };
      const output = yamlCatalog.write(withSource(source), input)!;
      expect(output).toBe(expected);
      expect(yamlCatalog.read(base(), [f("config/locales/ko.yml", output)]).locales[0]?.entries).toContainEqual(input.entries[0]);
      expect(yamlCatalog.write(withSource(source), input)).toBe(output);
      expect(yamlCatalog.write(withSource(output), input)).toBe(output);
    });
  }
});

describe("yaml-catalog — 추가 경계와 복합 편집", () => {
  it.each(["", "# keep\n", "---\n# keep\n...\n"])("빈 문서에도 원본을 보존하며 삽입한다: %j", (source) => {
    const input = { locale: "ko", entries: [{ key: "new", message: "value" }] };
    const at = source.indexOf("...");
    const expected = at < 0 ? source + "new: value" + (source.endsWith("\n") ? "\n" : "")
      : source.slice(0, at) + "new: value\n" + source.slice(at);
    const output = yamlCatalog.write(withSource(source), input)!;
    expect(output).toBe(expected);
    expect(yamlCatalog.write(withSource(output), input)).toBe(output);
  });

  it.each(["a: >-\n  old", "a:\n  - >-\n    old\n", "a: |4- # keep\n    old\nb: next\n", "a: |-\n            old\nb: next\n"])("블록 EOF·시퀀스·큰 들여쓰기: %j", (source) => {
    const key = source.includes("  -") ? "a.0" : "a";
    for (const message of ["new", "new\n", " leading\n\n", "x\u0001y"]) {
      const input = { locale: "ko", entries: [{ key, message }] };
      const output = yamlCatalog.write(withSource(source), input)!;
      const read = yamlCatalog.read(base(), [f("config/locales/ko.yml", output)]);
      expect(read.errors).toEqual([]);
      expect(read.locales[0]?.entries).toContainEqual({ key, message });
      expect(yamlCatalog.write(withSource(output), input)).toBe(output);
    }
  });

  it("여러 치환·중첩/상위 삽입의 같은 끝 위치도 보존한다", () => {
    const source = "a: {x: old} # flow\nb:\n  y: old\n";
    const entries = [
      { key: "a.x", message: "edit" }, { key: "a.z", message: "insert" },
      { key: "b.y", message: "edit" }, { key: "b.z", message: "insert" },
      { key: "z", message: "root" },
    ];
    const output = yamlCatalog.write(withSource(source), { locale: "ko", entries })!;
    expect(output).toBe("a: {x: edit, z: insert} # flow\nb:\n  y: edit\n  z: insert\nz: root\n");
    expect(yamlCatalog.write(withSource(source), { locale: "ko", entries: [...entries].reverse() })).toBe(output);
    expect(yamlCatalog.write(withSource(output), { locale: "ko", entries })).toBe(output);
  });

  it("flow의 주석·개행·끝 쉼표와 삽입값의 개행도 보존한다", () => {
    const source = "a: {x: old, # keep\n}\n";
    const input = { locale: "ko", entries: [{ key: "a.z", message: "line\nnext\n" }] };
    const output = yamlCatalog.write(withSource(source), input)!;
    expect(output).toContain(', # keep\n}\n');
    expect(yamlCatalog.read(base(), [f("config/locales/ko.yml", output)]).locales[0]?.entries).toContainEqual(input.entries[0]);
    expect(yamlCatalog.write(withSource(output), input)).toBe(output);
  });
});

describe("yaml-catalog — 자체 검증 회귀", () => {
  it.each(["a: |", "a: | # keep", "a: >-\n  old\nb: keep\n", "%YAML 1.1\n---\na: old\n"])("블록 헤더·공백 값·실제 스키마: %j", (source) => {
    for (const message of ["new", " ", "  ", "\n", "yes"]) {
      const input = { locale: "ko", entries: [{ key: "a", message }] };
      const output = yamlCatalog.write(withSource(source), input)!;
      const parsed = parseDocument(output);
      expect(parsed.errors).toEqual([]);
      expect(parsed.get("a")).toBe(message);
      expect(yamlCatalog.write(withSource(source), input)).toBe(output);
      expect(yamlCatalog.write(withSource(output), input)).toBe(output);
    }
  });
  it.each(["a: {}\n", "a: {x: old}\n", "%YAML 1.1\n---\na: {}\n"])("flow 삽입 개행·타입: %j", (source) => {
    for (const message of ["line\nnext", "yes", " "]) {
      const input = { locale: "ko", entries: [{ key: "a.z", message }] };
      const output = yamlCatalog.write(withSource(source), input)!;
      const parsed = parseDocument(output);
      expect(parsed.errors).toEqual([]);
      expect(parsed.getIn(["a", "z"])).toBe(message);
      expect(yamlCatalog.write(withSource(output), input)).toBe(output);
    }
  });
});

describe("yaml-catalog — 빈 스칼라의 속성 구분자", () => {
  it.each([
    ["a: &ref\nb: *ref\n", "a: &ref new\nb: *ref\n"],
    ["a: !!str\nb: keep\n", "a: !!str new\nb: keep\n"],
    ["a: &ref !!str\nb: *ref\n", "a: &ref !!str new\nb: *ref\n"],
  ])("앵커·태그와 새 값 사이를 구분한다: %j", (source, expected) => {
    const input = { locale: "ko", entries: [{ key: "a", message: "new" }] };
    const output = yamlCatalog.write(withSource(source), input)!;
    expect(output).toBe(expected);
    const parsed = parseDocument(output);
    expect(parsed.errors).toEqual([]);
    expect(parsed.get("a")).toBe("new");
    if (source.includes("*ref")) expect(parsed.toJS().b).toBe("new");
    expect(yamlCatalog.write(withSource(output), input)).toBe(output);
  });
});

describe("yaml-catalog — coincident empty scalar and map insertion", () => {
  it.each([
    ["a:", "a", "z"],
    ["a: ", "a", "z"],
    ["a:\n", "a", "z"],
    ["a: {x:}\n", "a.x", "a.z"],
    ["a: {x: }\n", "a.x", "a.z"],
    ["a:\n  x:", "a.x", "a.z"],
    ["a:\n  x:\n", "a.x", "a.z"],
  ])("keeps both values at the same offset: %j", (source, edited, added) => {
    const entries = [{ key: edited, message: "edit" }, { key: added, message: "insert" }];
    const input = { locale: "ko", entries };
    const result = yamlCatalog.writeWithErrors!(withSource(source), input);
    expect(result.errors).toEqual([]);
    const parsed = parseDocument(result.content!);
    expect(parsed.errors).toEqual([]);
    expect(parsed.getIn(edited.split("."))).toBe("edit");
    expect(parsed.getIn(added.split("."))).toBe("insert");
    expect(yamlCatalog.write(withSource(source), { ...input, entries: [...entries].reverse() })).toBe(result.content);
    expect(yamlCatalog.write(withSource(result.content!), input)).toBe(result.content);
  });
});

describe("yaml-catalog — keep chomping beside preserved blank lines", () => {
  for (const style of ["|", ">"] as const) {
    for (const newline of ["\n", "\r\n"]) {
      it.each(["\nb: keep\n", "\n\n# keep\nb: keep\n", "  \n\nb: keep\n", "\n...\n", "\n\n"])(
        `${style} preserves the requested trailing newlines and untouched suffix (${JSON.stringify(newline)}): %j`,
        (tail) => {
          const suffix = tail.replace(/\n/g, newline);
          const source = `a: ${style}- # header${newline}  old${newline}` + suffix;
          for (const message of ["new\n\n", "new\n\n\n", "first\n second\n\n"]) {
            for (const insert of [false, true]) {
              const entries = [{ key: "a", message }, ...(insert ? [{ key: "z", message: "insert" }] : [])];
              const input = { locale: "ko", entries };
              const result = yamlCatalog.writeWithErrors!(withSource(source), input);
              expect(result.errors).toEqual([]);
              const parsed = parseDocument(result.content!);
              expect(parsed.errors).toEqual([]);
              expect(parsed.get("a")).toBe(message);
              if (insert) expect(parsed.get("z")).toBe("insert");
              else expect(result.content!.endsWith(suffix)).toBe(true);
              expect(result.content).toContain("# header" + newline);
              expect(yamlCatalog.write(withSource(source), input)).toBe(result.content);
              expect(yamlCatalog.write(withSource(result.content!), input)).toBe(result.content);
            }
          }
        },
      );
    }
  }
});

/**
 * **깊이 2 이상의 점 키** — `errors: { "messages.blank": x }`를 read는 `errors.messages.blank`로 낸다. write가
 * 그 키를 "리터럴 전체 / 전부 split" 둘로만 찾으면 못 찾고 없는 키로 판정해 `errors` 아래에 `"messages.blank"`를
 * **또** 넣었다 — write마다 중복이 하나씩 늘었다 (launch-readiness L1.4, POSTMORTEM 2026-09-02 재발).
 * 조회와 삽입이 **각 깊이에서 리터럴 우선으로 내려가는 같은 걷기**를 써야 한다.
 */
describe("yaml-catalog — 깊은 점 키는 중복 삽입하지 않는다 (L1.4)", () => {
  const cases = [
    ["깊이 2", "ko:\n  errors:\n    \"messages.blank\": old\n    other: keep\n", "errors.messages.blank", '"messages.blank"'],
    ["깊이 3", "ko:\n  errors:\n    \"messages.blank.title\": old\n", "errors.messages.blank.title", '"messages.blank.title"'],
    ["실제 중첩과 혼재 — 뒤에 오는 리터럴이 read의 last-wins와 같은 항목", "ko:\n  errors:\n    messages:\n      blank: keep\n    \"messages.blank\": old\n", "errors.messages.blank", '"messages.blank"'],
    ["앵커가 걸린 맵 아래", "ko:\n  errors: &errs\n    \"messages.blank\": old\n  ref: *errs\n", "errors.messages.blank", '"messages.blank"'],
    ["대괄호 키", "ko:\n  \"arr[0]\": old\n", "arr[0]", '"arr[0]"'],
    ["따옴표를 품은 키", "ko:\n  'he said \"x\"': old\n", 'he said "x"', "'he said \"x\"'"],
  ] as const;
  const count = (s: string, literal: string) => s.split(literal).length - 1;

  for (const [name, source, key, literal] of cases) {
    it(`${name}: 값 무변경이면 원본 바이트 그대로`, () => {
      const res = yamlCatalog.writeWithErrors!(withSource(source), { locale: "ko", entries: [{ key, message: "old" }] });
      expect(res.errors).toEqual([]);
      expect(res.content).toBe(source);
    });

    it(`${name}: 값 변경이면 그 줄만 바뀌고 키는 하나로 남는다`, () => {
      const input = { locale: "ko", entries: [{ key, message: "new" }] };
      const res = yamlCatalog.writeWithErrors!(withSource(source), input);
      expect(res.errors).toEqual([]);
      const out = res.content!;
      expect(count(out, literal)).toBe(count(source, literal));
      const diff = out.split("\n").filter((line, i) => line !== source.split("\n")[i]);
      expect(diff).toHaveLength(1);
      const back = yamlCatalog.read(base(), [f("config/locales/ko.yml", out)]);
      expect(back.errors).toEqual([]);
      expect(back.locales[0]?.entries).toContainEqual({ key, message: "new" });
      expect(yamlCatalog.write(withSource(out), input)).toBe(out);
    });
  }

  it("없는 깊은 점 키는 가장 깊은 기존 맵에 리터럴 하나로 넣고, 기존 점 키는 건드리지 않는다", () => {
    const source = "ko:\n  errors:\n    \"messages.blank\": keep\n";
    const input = { locale: "ko", entries: [{ key: "errors.messages.other", message: "added" }] };
    const out = yamlCatalog.write(withSource(source), input)!;
    expect(count(out, '"messages.blank"')).toBe(1);
    expect(out).toContain("messages.other");
    const back = yamlCatalog.read(base(), [f("config/locales/ko.yml", out)]);
    expect(back.errors).toEqual([]);
    expect(back.locales[0]?.entries).toContainEqual({ key: "errors.messages.other", message: "added" });
    expect(yamlCatalog.write(withSource(out), input)).toBe(out);
  });
});

/**
 * **삽입하는 항목은 형제 스칼라의 인용 타입을 따른다** (audit #56). 전에는 키·값 모두 PLAIN이라 전부 큰따옴표인 Rails 파일에
 * 새 키 하나만 맨 문자열로 들어가 lint(yamllint `quoted-strings`)를 깨뜨렸다. 치환(`scalarReplacement`)은 이미 원래 노드의
 * 타입을 따른다 — 삽입만 빠져 있었다. code-dict의 `dominantQuote`와 같은 다수결이고, 동수면 옛 동작(PLAIN)이다.
 */
describe("yaml-catalog — 삽입 인용 타입 (audit #56)", () => {
  const insert = (source: string, key = "a.z", message = "new") =>
    yamlCatalog.write(withSource(source), { locale: "ko", entries: [{ key, message }] })!;

  it.each([
    ["큰따옴표 값", 'a:\n  x: "old"\n  y: "two"\n', 'a:\n  x: "old"\n  y: "two"\n  z: "new"\n'],
    ["작은따옴표 값", "a:\n  x: 'old'\n  y: 'two'\n", "a:\n  x: 'old'\n  y: 'two'\n  z: 'new'\n"],
    ["인용 키", 'a:\n  "x": old\n  "y": two\n', 'a:\n  "x": old\n  "y": two\n  "z": new\n'],
    ["맨 문자열 (짝)", "a:\n  x: old\n  y: two\n", "a:\n  x: old\n  y: two\n  z: new\n"],
    ["동수는 맨 문자열", "a:\n  x: \"old\"\n  y: two\n", "a:\n  x: \"old\"\n  y: two\n  z: new\n"],
    ["flow 맵", 'a: {x: "old"}\n', 'a: {x: "old", z: "new"}\n'],
  ])("%s", (_name, source, expected) => {
    const out = insert(source);
    expect(out).toBe(expected);
    expect(yamlCatalog.read(base(), [f("config/locales/ko.yml", out)]).locales[0]?.entries).toContainEqual({ key: "a.z", message: "new" });
    expect(insert(out)).toBe(out);
  });

  it("형제가 없는 빈 맵은 파일 전체의 다수를 본다", () => {
    const out = insert('b: "keep"\nc: "keep"\na: {}\n');
    expect(out).toBe('b: "keep"\nc: "keep"\na: {z: "new"}\n');
  });

  it("인용이 필요한 값은 형제가 맨 문자열이어도 안전하게 인용한다", () => {
    const out = insert("a:\n  x: old\n", "a.z", "yes");
    expect(parseDocument(out).getIn(["a", "z"])).toBe("yes");
  });
});

describe("yaml-catalog — 삽입 인용: 형제가 맵뿐이면 파일을 본다 (audit #56 리뷰)", () => {
  it("루트 로케일 아래가 전부 네임스페이스 맵이어도 파일의 다수 인용을 따른다", () => {
    const source = 'ko:\n  a:\n    x: "old"\n  b:\n    y: "old"\n';
    const out = yamlCatalog.write(withSource(source), { locale: "ko", entries: [{ key: "top", message: "new" }] })!;
    expect(out).toBe('ko:\n  a:\n    x: "old"\n  b:\n    y: "old"\n  top: "new"\n');
  });
});
