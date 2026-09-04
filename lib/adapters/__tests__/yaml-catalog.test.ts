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

  it("중간 경로가 없으면 만든다", () => {
    const out = yamlCatalog.write(withSource(RAILS), {
      locale: "ko",
      entries: [{ key: "brand.new.deep", message: "깊은 새 값" }],
    })!;
    expect(out).toContain("깊은 새 값");
  });

  it("삽입 순서가 결정적이다 — 같은 입력이면 같은 바이트", () => {
    const entries = [
      { key: "common.zeta", message: "Z" },
      { key: "common.alpha", message: "A" },
    ];
    const a = yamlCatalog.write(withSource(RAILS), { locale: "ko", entries })!;
    const b = yamlCatalog.write(withSource(RAILS), { locale: "ko", entries: [...entries].reverse() })!;
    expect(b).toBe(a);
    // 코드포인트 순서로 들어간다
    expect(a.indexOf("alpha")).toBeLessThan(a.indexOf("zeta"));
  });

  it("루트 키가 없는 파일에도 삽입한다", () => {
    const out = yamlCatalog.write(withSource(FLAT_ROOT), {
      locale: "ko",
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
    expect(r.errors.map((e) => e.message).join(" ")).toContain("중복");
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
    expect(res.errors.some((e) => e.message.includes("ref"))).toBe(true);
  });

  it("맵 자리에 스칼라를 쓰려 하면 포기하되 에러로 남긴다", () => {
    const src = "ko:\n  grp:\n    inner: 값\n";
    const res = yamlCatalog.writeWithErrors!(withSource(src), {
      locale: "ko",
      entries: [{ key: "grp", message: "스칼라로 덮으려 한다" }],
    });
    expect(res.content).toBe(src);
    expect(res.errors.some((e) => e.message.includes("grp"))).toBe(true);
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
