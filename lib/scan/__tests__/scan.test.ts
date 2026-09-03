import { describe, expect, it } from "vitest";
import { scanSources, type SourceFileInput } from "../index";

/** 래퍼를 import한 파일. 이 import가 없으면 스캐너는 그 파일의 t()를 건드리지 않는다. */
const ts = (path: string, code: string): SourceFileInput => ({
  path,
  code: `import { t } from "@/i18n";\n${code}`,
  kind: "ts",
});
/** import 없는 파일 — 남의 t()를 가진 리포를 재현한다. */
const tsNoImport = (path: string, code: string): SourceFileInput => ({ path, code, kind: "ts" });

/** 경고 없이 끝나는 스캔. 경고가 있으면 메시지를 노출해 실패시킨다. */
const clean = (...files: SourceFileInput[]) => {
  const r = scanSources(files);
  expect(r.warnings.map((w) => `${w.path}:${w.line} ${w.message}`)).toEqual([]);
  return r.refs;
};

const keysOf = (refs: ReadonlyArray<{ key: string }>) => refs.map((r) => r.key);

describe("스캔 결과는 refs뿐이다 (진실이 아니다)", () => {
  it("sourceText·namespace·description을 돌려주지 않는다 — 어댑터 소관이다", () => {
    const refs = clean(ts("src/a.ts", 't("popup_title", "Start recording");'));
    expect(refs).toEqual([{ key: "popup_title", refs: [{ path: "src/a.ts", line: 2 }] }]);
  });

  it("결과에 errors 필드가 없다 — 스캔은 CI를 실패시키지 않는다", () => {
    const r = scanSources([ts("src/a.ts", "t(dynamicKey, x);")]);
    expect(r).not.toHaveProperty("errors");
    expect(Object.keys(r).sort()).toEqual(["refs", "warnings"]);
  });
});

describe("refs 수집", () => {
  it("줄 번호가 정확하다", () => {
    const refs = clean(
      ts("src/a.ts", ["const x = 1;", "", 't("a_one", "One");', "", 't("a_two", "Two");'].join("\n")),
    );
    expect(refs.find((r) => r.key === "a_one")?.refs).toEqual([{ path: "src/a.ts", line: 4 }]);
    expect(refs.find((r) => r.key === "a_two")?.refs).toEqual([{ path: "src/a.ts", line: 6 }]);
  });

  it("같은 키를 여러 곳에서 부르면 합쳐지고 path·line으로 정렬된다", () => {
    const refs = clean(
      ts("src/z.ts", 't("k_x", "X");'),
      ts("src/a.ts", 't("k_x", "X");'),
    );
    expect(refs[0]?.refs).toEqual([
      { path: "src/a.ts", line: 2 },
      { path: "src/z.ts", line: 2 },
    ]);
  });

  it("키가 정렬되어 나온다", () => {
    const refs = clean(ts("src/a.ts", ['t("z_l", "Z");', 't("a_f", "A");', 't("m_m", "M");'].join("\n")));
    expect(keysOf(refs)).toEqual(["a_f", "m_m", "z_l"]);
  });

  it("원문 인자가 없어도 refs는 수집한다 — 원문은 로케일 파일에서 온다", () => {
    const refs = clean(ts("src/a.ts", 't("just_key");'));
    expect(keysOf(refs)).toEqual(["just_key"]);
  });

  it("chrome.i18n.getMessage 직접 호출도 잡는다 (래퍼가 없는 리포)", () => {
    const refs = clean(tsNoImport("src/a.ts", 'chrome.i18n.getMessage("direct_key");'));
    expect(keysOf(refs)).toEqual(["direct_key"]);
  });

  it("점 표기 키도 잡는다 (json-catalog 리포)", () => {
    const refs = clean(ts("src/a.ts", 't("common.viewAll");'));
    expect(keysOf(refs)).toEqual(["common.viewAll"]);
  });
});

describe("AST — 우리 것이 아닌 호출은 건드리지 않는다", () => {
  it("주석·문자열 안의 호출을 무시한다", () => {
    const refs = clean(
      ts("src/a.ts", [
        '// t("commented", "nope");',
        '/* t("block", "nope"); */',
        "const s = 't(\"in_string\", \"nope\")';",
        't("real_key", "yes");',
      ].join("\n")),
    );
    expect(keysOf(refs)).toEqual(["real_key"]);
  });

  it("래퍼를 import하지 않은 파일의 t()는 무시하고 경고도 내지 않는다", () => {
    const r = scanSources([tsNoImport("src/other.ts", 't("theirs");')]);
    expect(r.refs).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("다른 모듈에서 온 t()도 무시한다", () => {
    const r = scanSources([tsNoImport("src/o.ts", 'import { t } from "./their-i18n";\nt("theirs");')]);
    expect(r.refs).toEqual([]);
  });

  it("별칭 import를 따라간다", () => {
    const refs = clean({
      path: "src/a.ts",
      code: 'import { t as translate } from "@/i18n";\ntranslate("aliased", "V");',
      kind: "ts",
    });
    expect(keysOf(refs)).toEqual(["aliased"]);
  });

  it("래퍼 식별자를 지정할 수 있다", () => {
    const r = scanSources(
      [{ path: "src/a.ts", code: 'import { tx } from "@/l10n";\ntx("custom");', kind: "ts" }],
      [{ module: "@/l10n", export: "tx", kind: "direct" }],
    );
    expect(keysOf(r.refs)).toEqual(["custom"]);
  });
});

describe("경고 — 위치를 못 찾은 호출 (실패가 아니다)", () => {
  it("동적 키는 경고다", () => {
    const r = scanSources([ts("src/a.ts", "t(`status_${state}`);")]);
    expect(r.refs).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatchObject({ path: "src/a.ts", line: 2 });
    expect(r.warnings[0]?.message).toMatch(/리터럴/);
  });

  it("변수 키도 경고다", () => {
    expect(scanSources([ts("src/a.ts", "t(dynamicKey);")]).warnings).toHaveLength(1);
  });

  it("인자가 아예 없으면 경고다", () => {
    expect(scanSources([ts("src/a.ts", "t();")]).warnings).toHaveLength(1);
  });

  it("@l10n-keys로 명시 등록하면 경고가 사라지고 refs가 잡힌다", () => {
    const refs = clean(
      ts("src/a.ts", ["// @l10n-keys status_pending, status_running", "t(`status_${s}`);"].join("\n")),
    );
    expect(keysOf(refs)).toEqual(["status_pending", "status_running"]);
  });

  it("명시 등록된 키의 refs는 지시자가 있는 파일을 가리킨다", () => {
    const refs = clean(ts("src/a.ts", ["// @l10n-keys dyn_a", "t(`dyn_${x}`);"].join("\n")));
    expect(refs[0]?.refs[0]?.path).toBe("src/a.ts");
  });
});

describe("정규식 경로 — __MSG_key__", () => {
  it("파일 종류와 무관하게 토큰을 훑는다 (manifest.config.ts는 .ts다)", () => {
    const refs = clean(
      tsNoImport("manifest.config.ts", 'export default { name: "__MSG_ext_name__" };'),
      ts("src/a.ts", 't("ext_name");'),
    );
    expect(refs[0]?.refs).toEqual([
      { path: "manifest.config.ts", line: 1 },
      { path: "src/a.ts", line: 2 },
    ]);
  });

  it("HTML의 토큰도 잡고, 대응 원문이 없어도 경고조차 내지 않는다", () => {
    // 원문 존재 여부는 어댑터가 판단한다 — 스캔은 사용처만 안다.
    const r = scanSources([{ path: "popup.html", code: "<h1>__MSG_only_in_html__</h1>", kind: "raw" }]);
    expect(keysOf(r.refs)).toEqual(["only_in_html"]);
    expect(r.warnings).toEqual([]);
  });

  it("여러 줄에서 각각의 줄 번호를 잡는다", () => {
    const refs = clean({ path: "m.html", code: ["<a>__MSG_a_x__</a>", "", "<b>__MSG_b_y__</b>"].join("\n"), kind: "raw" });
    expect(refs.find((r) => r.key === "b_y")?.refs).toEqual([{ path: "m.html", line: 3 }]);
  });
});

describe("키 이름·원문 검증을 하지 않는다 (어댑터 소관)", () => {
  it("chrome이 허용하지 않는 키 이름도 그냥 refs로 잡는다", () => {
    const r = scanSources([ts("src/a.ts", 't("common.ok");')]);
    expect(keysOf(r.refs)).toEqual(["common.ok"]);
    expect(r.warnings).toEqual([]);
  });

  it("같은 키에 다른 원문이 있어도 경고하지 않는다 — 원문은 코드가 정하지 않는다", () => {
    const r = scanSources([
      ts("src/a.ts", 't("dup", "First");'),
      ts("src/b.ts", 't("dup", "Second");'),
    ]);
    expect(r.warnings).toEqual([]);
    expect(r.refs[0]?.refs).toHaveLength(2);
  });
});
