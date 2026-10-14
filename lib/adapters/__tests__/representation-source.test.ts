import { describe, expect, it } from "vitest";

import { chromeLocales } from "../chrome-locales";
import { jsonCatalog } from "../json-catalog";
import type { Adapter, DetectedFormat, LocaleEntry } from "../types";

/**
 * **새 언어 파일의 표현 출처** (locale-add design §4 · tasks §5 셋째). 기준 언어 파일에서 **표현만** 빌리고, 구조는 소스의 `nested`·`nestedByPath`가
 * 정한다. 축마다 "빌린다 + 자기 파일을 원본으로 다시 쓰면 바이트가 같다(read → write → read 고정점)"를 함께 잰다 — 고정점이 깨지면 새 언어가 생긴
 * 다음 Publish부터 값 편집 0건인 diff가 매번 난다.
 */

const JSON_FORMAT: DetectedFormat = { adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", locales: ["en", "fr"] };
const CHROME_FORMAT: DetectedFormat = { adapter: "chrome-locales", pathTemplate: "_locales/{locale}/messages.json", locales: ["en", "fr"] };

function create(adapter: Adapter, format: DetectedFormat, source: string, entries: LocaleEntry[]) {
  const created = adapter.write({ ...format, representationSource: source }, { locale: "fr", entries });
  if (created === null) throw new Error("null");
  const path = format.pathTemplate.replaceAll("{locale}", "fr");
  // 다음 Publish — 자기 파일이 원본이고 출처는 보지 않는다. 같은 바이트여야 한다.
  const again = adapter.write({ ...format, currentFiles: [{ path, content: created }] }, { locale: "fr", entries });
  const reread = adapter.read(format, [{ path, content: created }]).locales[0]?.entries.map(e => [e.key, e.message]);
  return { created, again, reread };
}

describe("json-catalog — 기준 파일의 표현을 빌린다", () => {
  const entries: LocaleEntry[] = [{ key: "a", message: "É/x" }, { key: "list", message: "" }];
  it.each([
    ["4칸", '{\n    "a": "A"\n}\n', '{\n    "a": "É/x"\n}\n'],
    ["CRLF", '{\r\n  "a": "A"\r\n}\r\n', '{\r\n  "a": "É/x"\r\n}\r\n'],
    ["BOM", '﻿{\n  "a": "A"\n}\n', '﻿{\n  "a": "É/x"\n}\n'],
    ["비ASCII·슬래시 이스케이프", '{\n  "a": "\\u00c9\\/b"\n}\n', '{\n  "a": "\\u00c9\\/x"\n}\n'],
  ])("%s", (_name, source, expected) => {
    const { created, again, reread } = create(jsonCatalog, JSON_FORMAT, source, entries);
    expect(created).toBe(expected);
    expect(again).toBe(created);
    expect(reread).toEqual([["a", "É/x"]]);
  });

  it("한 줄 컨테이너도 빌린다 — 같은 경로의 배열이 한 줄로 나가고 고정점이 선다", () => {
    const source = '{\n  "a": "A",\n  "list": ["x", "y"]\n}\n';
    const format = { ...JSON_FORMAT, nested: true };
    const { created, again } = create(jsonCatalog, format, source, [{ key: "a", message: "B" }, { key: "list.0", message: "p" }, { key: "list.1", message: "q" }]);
    expect(created).toBe('{\n  "a": "B",\n  "list": ["p", "q"]\n}\n');
    expect(again).toBe(created);
  });

  it("구조는 빌리지 않는다 — 기준 파일이 중첩이어도 평평한 소스면 점 키 그대로, 기준 파일이 빈 `{}`이어도 중첩 소스면 중첩", () => {
    const nestedSource = '{\n  "group": {\n    "a": "A"\n  }\n}\n';
    expect(create(jsonCatalog, { ...JSON_FORMAT, nested: false }, nestedSource, [{ key: "group.a", message: "B" }]).created).toBe('{\n  "group.a": "B"\n}\n');
    const nested = create(jsonCatalog, { ...JSON_FORMAT, nested: true }, "{}\n", [{ key: "group.a", message: "B" }]);
    expect(nested.created).toBe('{\n  "group": {\n    "a": "B"\n  }\n}\n');
    expect(nested.again).toBe(nested.created);
  });

  it("기준 파일의 값·키는 새지 않는다", () => {
    const { created } = create(jsonCatalog, JSON_FORMAT, '{\n  "only_in_base": "SECRET"\n}\n', [{ key: "a", message: "B" }]);
    expect(created).not.toMatch(/only_in_base|SECRET/);
  });
});

describe("chrome-locales — 필드 순서·들여쓰기는 빌리고 description·placeholders는 그 언어의 셀에서만", () => {
  const source = '{\n    "hi": {\n        "description": "Greeting",\n        "message": "Hi $NAME$",\n        "placeholders": { "name": { "content": "$1" } }\n    }\n}\n';
  it("기준 파일의 description·placeholders를 복사하지 않는다", () => {
    const { created, again } = create(chromeLocales, CHROME_FORMAT, source, [{ key: "hi", message: "Salut $NAME$" }]);
    expect(created).toBe('{\n    "hi": {\n        "message": "Salut $NAME$"\n    }\n}\n');
    expect(again).toBe(created);
  });
  it("그 언어의 셀에 있으면 기준 파일의 필드 순서로 낸다 — 되살린 `placeholders: null`도 그대로", () => {
    const { created, again } = create(chromeLocales, CHROME_FORMAT, source, [{ key: "hi", message: "Salut", description: "Salutation", placeholders: null }]);
    expect(created).toBe('{\n    "hi": {\n        "description": "Salutation",\n        "message": "Salut",\n        "placeholders": null\n    }\n}\n');
    expect(again).toBe(created);
  });
});
