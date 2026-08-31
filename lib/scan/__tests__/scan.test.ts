import { describe, expect, it } from "vitest";
import { namespaceOf, scanSources, type SourceFileInput } from "../index";

const ts = (path: string, code: string): SourceFileInput => ({ path, code, kind: "ts" });
const raw = (path: string, code: string): SourceFileInput => ({ path, code, kind: "raw" });

/** 성공을 기대하는 스캔. 에러가 있으면 메시지를 그대로 노출해 실패시킨다. */
const ok = (...files: SourceFileInput[]) => {
  const r = scanSources(files);
  expect(r.errors.map((e) => `${e.path}:${e.line} ${e.message}`)).toEqual([]);
  return r.keys;
};

describe("namespaceOf — 키 접두사에서 파생", () => {
  it("첫 밑줄 앞부분이 namespace다", () => {
    expect(namespaceOf("popup_title")).toBe("popup");
    expect(namespaceOf("options_theme_label")).toBe("options");
  });

  it("밑줄이 없으면 _root", () => {
    expect(namespaceOf("EXTNAME")).toBe("_root");
  });

  it("선행 밑줄만 있으면 _root (빈 접두사를 만들지 않는다)", () => {
    expect(namespaceOf("_private")).toBe("_root");
  });
});

describe("AST 경로 — t(key, source) 추출", () => {
  it("리터럴 호출에서 key·sourceText를 뽑는다", () => {
    const keys = ok(ts("src/popup.ts", 't("popup_title", "Start recording");'));
    expect(keys).toEqual([
      {
        key: "popup_title",
        sourceText: "Start recording",
        namespace: "popup",
        refs: [{ path: "src/popup.ts", line: 1 }],
      },
    ]);
  });

  it("refs의 줄 번호가 정확하다", () => {
    const keys = ok(
      ts("src/a.ts", ['const x = 1;', '', 't("a_one", "One");', '', 't("a_two", "Two");'].join("\n")),
    );
    expect(keys.find((k) => k.key === "a_one")?.refs).toEqual([{ path: "src/a.ts", line: 3 }]);
    expect(keys.find((k) => k.key === "a_two")?.refs).toEqual([{ path: "src/a.ts", line: 5 }]);
  });

  it("같은 키를 여러 곳에서 부르면 refs가 합쳐진다", () => {
    const keys = ok(
      ts("src/a.ts", 't("common_ok", "OK");'),
      ts("src/b.ts", 'if (x) { t("common_ok", "OK"); }'),
    );
    expect(keys).toHaveLength(1);
    expect(keys[0]?.refs).toEqual([
      { path: "src/a.ts", line: 1 },
      { path: "src/b.ts", line: 1 },
    ]);
  });

  it("주석 속 호출은 무시한다 (정규식 단독으로는 못 걸러진다)", () => {
    const keys = ok(
      ts(
        "src/a.ts",
        [
          '// t("commented_out", "nope");',
          '/* t("block_comment", "nope"); */',
          't("real_key", "yes");',
        ].join("\n"),
      ),
    );
    expect(keys.map((k) => k.key)).toEqual(["real_key"]);
  });

  it("문자열 안의 t( 도 무시한다", () => {
    const keys = ok(ts("src/a.ts", ['const s = \'t("inside_string", "nope")\';', 't("real", "yes");'].join("\n")));
    expect(keys.map((k) => k.key)).toEqual(["real"]);
  });

  it("t가 아닌 함수 호출은 무시한다", () => {
    const keys = ok(ts("src/a.ts", ['other("not_a_key", "x");', 't("yes_key", "v");'].join("\n")));
    expect(keys.map((k) => k.key)).toEqual(["yes_key"]);
  });

  it("subs 세 번째 인자가 있어도 정상 추출한다", () => {
    const keys = ok(ts("src/a.ts", 't("time_minutesAgo", "{n}m ago", [String(n)]);'));
    expect(keys[0]?.sourceText).toBe("{n}m ago");
  });
});

describe("AST 경로 — @l10n-desc", () => {
  it("바로 위 줄의 @l10n-desc를 description으로 붙인다", () => {
    const keys = ok(
      ts("src/a.ts", ['// @l10n-desc Shown on the action button', 't("ext_name", "BugShot");'].join("\n")),
    );
    expect(keys[0]?.description).toBe("Shown on the action button");
  });

  it("없으면 description 필드 자체가 없다", () => {
    const keys = ok(ts("src/a.ts", 't("ext_name", "BugShot");'));
    expect(keys[0]).not.toHaveProperty("description");
  });
});

describe("에러 — 비리터럴 인자", () => {
  it("템플릿 리터럴 키는 에러다", () => {
    const r = scanSources([ts("src/a.ts", "t(`status_${state}`, \"Pending\");")]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({ path: "src/a.ts", line: 1 });
    expect(r.errors[0]?.message).toMatch(/리터럴/);
  });

  it("변수 키는 에러다", () => {
    const r = scanSources([ts("src/a.ts", 't(dynamicKey, "Pending");')]);
    expect(r.errors).toHaveLength(1);
  });

  it("비리터럴 원문도 에러다", () => {
    const r = scanSources([ts("src/a.ts", "t(\"a_key\", `hello ${name}`);")]);
    expect(r.errors).toHaveLength(1);
  });

  it("인자가 부족하면 에러다", () => {
    const r = scanSources([ts("src/a.ts", 't("a_key");')]);
    expect(r.errors).toHaveLength(1);
  });
});

describe("에러 — @l10n-keys 화이트리스트로 비리터럴 허용", () => {
  it("주석이 있으면 통과하고 나열된 키가 결과에 들어간다", () => {
    const keys = ok(
      ts(
        "src/a.ts",
        [
          "// @l10n-keys status_pending, status_running",
          "const label = t(`status_${state}`, \"...\");",
        ].join("\n"),
      ),
    );
    expect(keys.map((k) => k.key)).toEqual(["status_pending", "status_running"]);
  });

  it("화이트리스트 키는 원문이 없으므로 sourceText가 빈 문자열이다", () => {
    const keys = ok(
      ts("src/a.ts", ["// @l10n-keys status_pending", 't(`status_${s}`, "...");'].join("\n")),
    );
    expect(keys[0]?.sourceText).toBe("");
  });

  it("화이트리스트가 있어도 리터럴 호출은 그대로 처리한다", () => {
    const keys = ok(
      ts(
        "src/a.ts",
        [
          "// @l10n-keys dyn_a",
          't(`dyn_${x}`, "...");',
          't("lit_key", "Literal");',
        ].join("\n"),
      ),
    );
    expect(keys.map((k) => k.key).sort()).toEqual(["dyn_a", "lit_key"]);
  });
});

describe("에러 — 같은 키에 다른 원문", () => {
  it("충돌하면 에러다", () => {
    const r = scanSources([
      ts("src/a.ts", 't("dup_key", "First");'),
      ts("src/b.ts", 't("dup_key", "Second");'),
    ]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]?.message).toMatch(/원문/);
  });

  it("같은 원문이면 충돌이 아니다", () => {
    const keys = ok(
      ts("src/a.ts", 't("same_key", "Same");'),
      ts("src/b.ts", 't("same_key", "Same");'),
    );
    expect(keys).toHaveLength(1);
  });
});

describe("에러 — 크롬이 허용하지 않는 키 이름", () => {
  it("점이 들어간 키는 에러다 (chrome.i18n은 [A-Za-z0-9_@]만 허용한다)", () => {
    const r = scanSources([ts("src/a.ts", 't("common.ok", "OK");')]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]?.message).toMatch(/키 이름/);
  });

  it("하이픈·공백도 에러다", () => {
    expect(scanSources([ts("src/a.ts", 't("a-b", "x");')]).errors).toHaveLength(1);
    expect(scanSources([ts("src/a.ts", 't("a b", "x");')]).errors).toHaveLength(1);
  });

  it("@ 와 밑줄은 허용한다", () => {
    const keys = ok(ts("src/a.ts", 't("@@ui_locale_x", "x");'));
    expect(keys[0]?.key).toBe("@@ui_locale_x");
  });
});

describe("정규식 경로 — __MSG_key__", () => {
  it("HTML·manifest의 토큰에서 키를 수집한다", () => {
    const keys = ok(
      ts("src/a.ts", 't("ext_name", "BugShot");'),
      raw("manifest.config.ts", 'name: "__MSG_ext_name__",'),
    );
    expect(keys).toHaveLength(1);
    expect(keys[0]?.refs).toEqual([
      { path: "src/a.ts", line: 1 },
      { path: "manifest.config.ts", line: 1 },
    ]);
  });

  it("원문은 AST 경로가 채운다 (정규식은 키만 준다)", () => {
    const keys = ok(
      raw("popup.html", "<h1>__MSG_popup_title__</h1>"),
      ts("src/a.ts", 't("popup_title", "Start");'),
    );
    expect(keys[0]?.sourceText).toBe("Start");
  });

  it("정규식 경로에만 있고 원문이 없으면 에러다", () => {
    const r = scanSources([raw("popup.html", "<h1>__MSG_orphan_token__</h1>")]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]?.message).toMatch(/원문/);
  });

  it("여러 줄에서 각각의 줄 번호를 잡는다", () => {
    const keys = ok(
      raw("m.html", ["<a>__MSG_a_x__</a>", "", "<b>__MSG_b_y__</b>"].join("\n")),
      ts("src/a.ts", ['t("a_x", "A");', 't("b_y", "B");'].join("\n")),
    );
    expect(keys.find((k) => k.key === "b_y")?.refs).toContainEqual({ path: "m.html", line: 3 });
  });
});

describe("결과 순서", () => {
  it("키가 정렬되어 나온다 (스캔 결과도 결정적이어야 한다)", () => {
    const keys = ok(
      ts("src/a.ts", ['t("z_last", "Z");', 't("a_first", "A");', 't("m_mid", "M");'].join("\n")),
    );
    expect(keys.map((k) => k.key)).toEqual(["a_first", "m_mid", "z_last"]);
  });

  it("refs도 정렬되어 나온다", () => {
    const keys = ok(
      ts("src/z.ts", 't("k_x", "X");'),
      ts("src/a.ts", 't("k_x", "X");'),
    );
    expect(keys[0]?.refs.map((r) => r.path)).toEqual(["src/a.ts", "src/z.ts"]);
  });
});
