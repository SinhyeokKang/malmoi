import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { exportLocale, type ExportKey } from "../export";
import { blobSha } from "../githash";

const key = (over: Partial<ExportKey> & Pick<ExportKey, "key">): ExportKey => ({
  sourceText: `src:${over.key}`,
  orphaned: false,
  ...over,
});

describe("exportLocale — 키 정렬은 코드포인트 오름차순", () => {
  // localeCompare는 Node ICU 버전·로케일에 따라 결과가 달라진다. 아래 두 순서는
  // 실제로 완전히 다르다 — 코드포인트: 1 A B Z _x a b z ä
  //                    localeCompare: _x 1 a A ä b B z Z
  const names = ["a", "A", "ä", "_x", "B", "b", "z", "Z", "1"];

  it("코드포인트 순서로 나온다 (localeCompare 순서가 아니다)", () => {
    const out = exportLocale(names.map((n) => key({ key: n })), { isBase: true });
    const order = [...(out ?? "").matchAll(/^ {2}"(.+)": \{$/gm)].map((m) => m[1]);
    expect(order).toEqual(["1", "A", "B", "Z", "_x", "a", "b", "z", "ä"]);
  });

  it("입력 순서를 뒤섞어도 출력이 동일하다 (DB 순서에 의존하지 않는다)", () => {
    const forward = exportLocale(names.map((n) => key({ key: n })), { isBase: true });
    const reversed = exportLocale([...names].reverse().map((n) => key({ key: n })), { isBase: true });
    expect(reversed).toBe(forward);
  });
});

describe("exportLocale — 형식", () => {
  const one = [key({ key: "greeting", sourceText: "Hello" })];

  it("들여쓰기 2칸", () => {
    expect(exportLocale(one, { isBase: true })).toContain('\n  "greeting": {\n    "message": "Hello"');
  });

  it("파일 끝 개행이 정확히 1개", () => {
    const out = exportLocale(one, { isBase: true })!;
    expect(out.endsWith("\n")).toBe(true);
    expect(out.endsWith("\n\n")).toBe(false);
  });

  it("같은 입력 두 번 호출 → 바이트 단위 동일 (불변식 본체)", () => {
    const a = exportLocale(one, { isBase: true });
    const b = exportLocale(one, { isBase: true });
    expect(b).toBe(a);
    expect(Buffer.from(b!, "utf8").equals(Buffer.from(a!, "utf8"))).toBe(true);
  });
});

describe("exportLocale — orphaned 키는 제외", () => {
  it("orphaned 키가 출력에 없다", () => {
    const out = exportLocale(
      [key({ key: "alive" }), key({ key: "gone", orphaned: true })],
      { isBase: true },
    );
    expect(out).toContain('"alive"');
    expect(out).not.toContain('"gone"');
  });

  it("남은 키가 orphaned뿐이면 null (파일을 내지 않는다)", () => {
    expect(exportLocale([key({ key: "gone", orphaned: true })], { isBase: true })).toBeNull();
  });
});

describe("exportLocale — description", () => {
  it("base 로케일에서 description이 있으면 포함한다", () => {
    const out = exportLocale(
      [key({ key: "k", sourceText: "S", description: "설명" })],
      { isBase: true },
    )!;
    expect(out).toContain('"description": "설명"');
  });

  it("없으면 필드 자체를 생략한다 (undefined가 새지 않는다)", () => {
    const out = exportLocale([key({ key: "k", sourceText: "S" })], { isBase: true })!;
    expect(out).not.toContain("description");
    expect(out).not.toContain("undefined");
  });

  it("null도 생략으로 취급한다 (Prisma의 nullable 컬럼이 그대로 온다)", () => {
    const out = exportLocale([key({ key: "k", description: null })], { isBase: true })!;
    expect(out).not.toContain("description");
  });

  // description은 원문에 대한 메타데이터다. 번역 파일마다 같은 텍스트를 복제하면
  // 바이트만 늘고 소비자가 없다 — 번역자는 편집 UI를 보고 JSON을 읽지 않는다.
  it("non-base 로케일에는 description을 넣지 않는다", () => {
    const out = exportLocale(
      [key({ key: "k", description: "설명", translation: "번역" })],
      { isBase: false },
    )!;
    expect(out).toContain('"번역"');
    expect(out).not.toContain("description");
  });
});

describe("exportLocale — base vs non-base", () => {
  const keys = [
    key({ key: "a", sourceText: "A-src", translation: "A-ko" }),
    key({ key: "b", sourceText: "B-src" }), // 미번역
  ];

  it("base는 sourceText를 message로 쓴다 (번역값을 보지 않는다)", () => {
    const out = exportLocale(keys, { isBase: true })!;
    expect(out).toContain('"A-src"');
    expect(out).toContain('"B-src"');
    expect(out).not.toContain("A-ko");
  });

  it("non-base는 번역값을 쓰고, 미번역 키는 제외한다 (크롬이 폴백한다)", () => {
    const out = exportLocale(keys, { isBase: false })!;
    expect(out).toContain('"A-ko"');
    expect(out).toContain('"a"');
    expect(out).not.toContain('"b"');
  });

  it("빈 문자열 번역도 미번역으로 취급한다", () => {
    const out = exportLocale([key({ key: "a", translation: "" })], { isBase: false });
    expect(out).toBeNull();
  });

  it("non-base에 번역이 하나도 없으면 null (🔒 결정: 빈 파일을 내지 않는다)", () => {
    expect(exportLocale(keys.map((k) => ({ ...k, translation: undefined })), { isBase: false }))
      .toBeNull();
  });

  it("키가 0개면 null", () => {
    expect(exportLocale([], { isBase: true })).toBeNull();
  });
});

describe("exportLocale — 이스케이프와 유니코드", () => {
  it("따옴표·개행·역슬래시가 JSON으로 이스케이프된다", () => {
    const out = exportLocale(
      [key({ key: "k", sourceText: 'a"b\\c\nd' })],
      { isBase: true },
    )!;
    expect(out).toContain('"a\\"b\\\\c\\nd"');
    expect(JSON.parse(out)).toEqual({ k: { message: 'a"b\\c\nd' } });
  });

  it("한글·이모지를 이스케이프하지 않고 그대로 낸다", () => {
    const out = exportLocale(
      [key({ key: "k", sourceText: "안녕 🎉" })],
      { isBase: true },
    )!;
    expect(out).toContain("안녕 🎉");
    expect(out).not.toContain("\\u");
  });
});

describe("exportLocale + blobSha — git hash-object와 일치 (2a·2b 접점)", () => {
  it("export 출력의 blobSha가 git 실측과 같다", () => {
    const out = exportLocale(
      [
        key({ key: "common.ok", sourceText: "OK", description: "confirm button" }),
        key({ key: "time.minutesAgo", sourceText: "{n}m ago" }),
        key({ key: "안녕", sourceText: "안녕하세요 🎉" }),
      ],
      { isBase: true },
    )!;
    const fromGit = execFileSync("git", ["hash-object", "--stdin"], {
      input: out,
      encoding: "utf8",
    }).trim();
    expect(blobSha(out)).toBe(fromGit);
  });
});
