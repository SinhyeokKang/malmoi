import { describe, expect, it } from "vitest";
import { decodeFileBytes, encodeFileContent, FileEncodingError } from "../file-encoding";

const content = '"key" = "한글 😀";\n';
// 구현의 인코더로 기대값을 만들면 같은 오류가 왕복 양쪽에서 상쇄된다.
const vectors = [
  ["utf-8", "226b657922203d2022ed959ceab88020f09f9880223b0a"],
  ["utf-16le", "22006b0065007900220020003d00200022005cd500ae20003dd800de22003b000a00"],
  ["utf-16le-bom", "fffe22006b0065007900220020003d00200022005cd500ae20003dd800de22003b000a00"],
  ["utf-16be", "0022006b0065007900220020003d00200022d55cae000020d83dde000022003b000a"],
  ["utf-16be-bom", "feff0022006b0065007900220020003d00200022d55cae000020d83dde000022003b000a"],
] as const;

describe("파일 인코딩", () => {
  it.each(vectors)("%s: 내용·인코딩·원본 바이트를 보존한다", (encoding, hex) => {
    const bytes = Buffer.from(hex, "hex");
    const decoded = decodeFileBytes("ko.lproj/Localizable.strings", bytes);
    expect(decoded).toEqual({ content, encoding });
    expect(encodeFileContent(content, encoding)).toEqual(bytes);
    expect(encodeFileContent(decoded.content, decoded.encoding)).toEqual(bytes);
    expect(encodeFileContent(content, encoding)).toEqual(encodeFileContent(content, encoding));
  });

  it.each(["", "a", "ASCII", "한글 😀", "\uFEFFa", "\uD800"])(
    'encodeFileContent(s, "utf-8")는 Buffer.from(s, "utf8")와 바이트가 같다: %j', (s) => {
      expect(encodeFileContent(s, "utf-8")).toEqual(Buffer.from(s, "utf8"));
    },
  );

  it.each(["a.json", "a.yaml", "a.ts", "a.strings.json", "a.strings/child", "a.STRINGS"])(
    "%s는 NUL 패턴이 있어도 UTF-16으로 판별하지 않는다", (path) => {
      const bytes = Buffer.from("a\0b\0");
      expect(decodeFileBytes(path, bytes)).toEqual({ content: "a\0b\0", encoding: "utf-8" });
      expect(() => decodeFileBytes(path, Buffer.from("fffe6100", "hex"))).toThrow(FileEncodingError);
    },
  );

  it.each(["", "a", "abc", "한글 😀"])("UTF-16 신호가 없는 %j는 UTF-8이다", (s) => {
    expect(decodeFileBytes("a.strings", Buffer.from(s))).toEqual({ content: s, encoding: "utf-8" });
  });

  it.each(["a.strings", "a.json"])("%s의 UTF-8 BOM은 문자열에 남는다", (path) => {
    const bytes = Buffer.from("efbbbf616263", "hex");
    const decoded = decodeFileBytes(path, bytes);
    expect(decoded).toEqual({ content: "\uFEFFabc", encoding: "utf-8" });
    expect(encodeFileContent(decoded.content, decoded.encoding)).toEqual(bytes);
  });

  it.each([
    ["fffe", "utf-16le-bom", ""], ["feff", "utf-16be-bom", ""],
    ["fffefffe6100", "utf-16le-bom", "\uFEFFa"],
    ["fefffeff0061", "utf-16be-bom", "\uFEFFa"],
  ] as const)("%s: 인코딩 BOM만 제거하고 본문 BOM은 남긴다", (hex, encoding, expected) => {
    const bytes = Buffer.from(hex, "hex");
    expect(decodeFileBytes("a.strings", bytes)).toEqual({ content: expected, encoding });
    expect(encodeFileContent(expected, encoding)).toEqual(bytes);
  });

  it.each([
    ["fffe00d8", "utf-16le-bom"], ["feffd800", "utf-16be-bom"],
    ["fffe00dc", "utf-16le-bom"], ["fffe61", "utf-16le-bom"],
    ["feff00", "utf-16be-bom"], ["6100620000d8", "utf-16le"],
    ["00610062d800", "utf-16be"], ["6100620063", "utf-16le"],
    ["ff", "utf-8"], ["c0af", "utf-8"], ["e282", "utf-8"], ["eda080", "utf-8"],
  ])("%s: 비가역 입력은 대체문자 없이 명시 실패한다", (hex, encoding) => {
    const decode = () => decodeFileBytes("a.strings", Buffer.from(hex, "hex"));
    expect(decode).toThrow(FileEncodingError);
    expect(decode).toThrow(expect.objectContaining({ code: "invalid-file-encoding", encoding }));
  });

  it("원문에 있던 U+FFFD는 유효한 문자라 보존한다", () => {
    expect(decodeFileBytes("a.strings", Buffer.from("�"))).toEqual({ content: "�", encoding: "utf-8" });
  });

  it("Uint8Array의 뷰 범위만 읽고 입력을 바꾸지 않는다", () => {
    const bytes = Uint8Array.from([255, 254, 97, 0, 98, 0, 255]);
    const original = bytes.slice();
    expect(decodeFileBytes("a.strings", bytes.subarray(2, 6))).toEqual({ content: "ab", encoding: "utf-16le" });
    expect(bytes).toEqual(original);
  });
});
