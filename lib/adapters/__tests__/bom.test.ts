import { describe, expect, it } from "vitest";
import { catalogVerdict, chromeLocales, detectFormat, jsonCatalog } from "../index";
import { observeJsonStyle, serializeJson } from "../json-style";
import type { DetectedFormat } from "../types";

/**
 * **UTF-8 BOM으로 시작하는 JSON 로케일 파일** (audit #57). Windows 편집기·Crowdin 내보내기가 붙인다. `JSON.parse`는
 * `U+FEFF`를 공백으로 보지 않아 던진다 — 그래서 읽기는 `parse-failed`(CI push exit 1), 탐지는 `catalogVerdict`가 `no`라
 * 후보 0(온보딩 예외 E)이었다. BOM은 **표현**이다: 읽을 때 벗기고, 재생성 writer는 원본에 있었으면 다시 붙인다
 * (없던 것을 붙이지도, 있던 것을 떼지도 않는다 — 떼면 값 편집 0건에 첫 줄이 바뀐다).
 */
const BOM = "﻿";
const EN = '{\n  "hello": "Hello"\n}\n';
const CHROME = '{\n  "hello": {\n    "message": "Hello"\n  }\n}\n';

const json: DetectedFormat = { adapter: "json-catalog", pathTemplate: "locales/{locale}.json", locales: ["en"] };
const chrome: DetectedFormat = { adapter: "chrome-locales", pathTemplate: "_locales/{locale}/messages.json", locales: ["en"] };

describe("BOM — 읽기", () => {
  it("json-catalog가 BOM 파일을 읽는다", () => {
    const r = jsonCatalog.read(json, [{ path: "locales/en.json", content: BOM + EN }]);
    expect(r.errors).toEqual([]);
    expect(r.locales[0]?.entries.map((e) => [e.key, e.message])).toEqual([["hello", "Hello"]]);
  });

  it("chrome-locales가 BOM 파일을 읽는다", () => {
    const r = chromeLocales.read(chrome, [{ path: "_locales/en/messages.json", content: BOM + CHROME }]);
    expect(r.errors).toEqual([]);
    expect(r.locales[0]?.entries.map((e) => [e.key, e.message])).toEqual([["hello", "Hello"]]);
  });

  it("catalogVerdict가 BOM 파일을 카탈로그로 판정한다", () => {
    expect(catalogVerdict(BOM + EN)).toBe("yes");
    expect(catalogVerdict(EN)).toBe("yes");
  });

  it("탐지가 BOM 파일 묶음을 후보로 낸다 — 온보딩 예외 E가 아니다", () => {
    const files = new Map([["locales/en.json", BOM + EN], ["locales/ko.json", BOM + '{\n  "hello": "안녕"\n}\n']]);
    const found = detectFormat([...files.keys()], (p) => files.get(p));
    expect(found?.adapter).toBe("json-catalog");
  });
});

describe("BOM — 쓰기는 원본의 표현을 따른다", () => {
  const entries = [{ key: "hello", message: "Hi" }];

  it("json-catalog: 원본에 BOM이 있으면 붙인다", () => {
    const out = jsonCatalog.write({ ...json, currentFiles: [{ path: "locales/en.json", content: BOM + EN }] }, { locale: "en", entries })!;
    expect(out).toBe(BOM + '{\n  "hello": "Hi"\n}\n');
  });

  it("chrome-locales: 원본에 BOM이 있으면 붙인다", () => {
    const out = chromeLocales.write({ ...chrome, currentFiles: [{ path: "_locales/en/messages.json", content: BOM + CHROME }] }, { locale: "en", entries })!;
    expect(out).toBe(BOM + '{\n  "hello": {\n    "message": "Hi"\n  }\n}\n');
  });

  it("원본에 BOM이 없거나 원본이 없으면 붙이지 않는다 (짝)", () => {
    expect(jsonCatalog.write({ ...json, currentFiles: [{ path: "locales/en.json", content: EN }] }, { locale: "en", entries })!.startsWith(BOM)).toBe(false);
    expect(jsonCatalog.write(json, { locale: "en", entries })!.startsWith(BOM)).toBe(false);
  });

  it("BOM 원본의 들여쓰기·줄바꿈 관측도 그대로다", () => {
    const style = observeJsonStyle(BOM + '{\r\n    "a": "b"\r\n}\r\n');
    expect(style).toMatchObject({ indent: "    ", eol: "\r\n", bom: true });
    expect(serializeJson({ a: "b" }, style)).toBe(BOM + '{\r\n    "a": "b"\r\n}\r\n');
  });

  it("값이 같으면 BOM 원본을 바이트 그대로 되돌린다 — 고정점", () => {
    const original = BOM + EN;
    const out = jsonCatalog.write({ ...json, currentFiles: [{ path: "locales/en.json", content: original }] }, { locale: "en", entries: [{ key: "hello", message: "Hello" }] });
    expect(out).toBe(original);
  });
});
