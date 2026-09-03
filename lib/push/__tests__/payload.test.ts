import { describe, expect, it } from "vitest";

import { PushPayload } from "../plan";
import { buildPushPayload, pickBaseLocale, selectLocaleFiles } from "../payload";
import type { DetectedFormat, ReadResult } from "@/lib/adapters/types";

/**
 * 페이로드 **생산자**의 계약. 전에는 `scripts/push-local.ts`의 리터럴이라 테스트가 닿지
 * 않았고, 계약이 넓어져도 컴파일러가 붙잡을 지점이 없었다 (POSTMORTEM 2026-08-31).
 */

const format: DetectedFormat = {
  adapter: "chrome-locales",
  pathTemplate: "_locales/{locale}/messages.json",
  locales: ["en", "ko"],
};

const read: ReadResult = {
  nested: false,
  errors: [],
  locales: [
    {
      locale: "en",
      entries: [
        { key: "apple", message: "Apple", order: 1, placeholders: { u: { content: "$1" } } },
        { key: "zebra", message: "Zebra", description: "동물", order: 0 },
      ],
    },
    {
      locale: "ko",
      entries: [
        { key: "apple", message: "사과", order: 1, description: "ko쪽 설명" },
        { key: "zebra", message: "얼룩말", order: 0 },
      ],
    },
  ],
};

const input = {
  projectSlug: "acme",
  commitSha: "a".repeat(40),
  commitAt: "2026-09-03T00:00:00+09:00",
  format,
  read,
  baseLocale: "en",
  scanRefs: [
    { key: "apple", refs: [{ path: "src/a.ts", line: 3 }] },
    { key: "ghost", refs: [{ path: "src/b.ts", line: 9 }] },
  ],
};

describe("pickBaseLocale", () => {
  it("en이 있으면 en이다", () => {
    expect(pickBaseLocale(["ko", "en", "fr"])).toBe("en");
  });

  it("en이 없으면 사전순 첫 번째다 — 리포 관례라 추정이고, 정본은 TASKS §3a의 🔒 항목이다", () => {
    expect(pickBaseLocale(["ko", "fr", "de"])).toBe("de");
  });

  it("입력 배열을 뒤집지 않는다", () => {
    const locales = ["ko", "fr"];
    pickBaseLocale(locales);
    expect(locales).toEqual(["ko", "fr"]);
  });

  it("로케일이 없으면 undefined다", () => {
    expect(pickBaseLocale([])).toBeUndefined();
  });
});

describe("selectLocaleFiles — 어댑터에게 무엇을 먹이는가", () => {
  const probe = (p: string) => `content of ${p}`;

  it("per-locale은 {locale}을 치환한다", () => {
    const files = selectLocaleFiles("per-locale", format, ["_locales/en/messages.json", "_locales/ko/messages.json"], probe);
    expect(files.map((f) => f.path)).toEqual(["_locales/en/messages.json", "_locales/ko/messages.json"]);
    expect(files[0]?.content).toBe("content of _locales/en/messages.json");
  });

  it("per-locale에서 리포에 없는 경로는 뺀다 — 빈 내용을 먹이면 어댑터가 키를 잃는다", () => {
    const files = selectLocaleFiles("per-locale", format, ["_locales/en/messages.json"], probe);
    expect(files.map((f) => f.path)).toEqual(["_locales/en/messages.json"]);
  });

  it("multi-locale은 pathTemplate의 디렉터리에서 ts를 모은다 (글롭이라 치환하지 않는다)", () => {
    const tsFormat: DetectedFormat = {
      adapter: "ts-dict",
      pathTemplate: "src/i18n/namespaces/*.ts",
      locales: ["en", "ko"],
    };
    const files = selectLocaleFiles("multi-locale", tsFormat, [
      "src/i18n/namespaces/common.ts",
      "src/i18n/namespaces/app.tsx",
      "src/i18n/namespaces/__tests__/common.test.ts",
      "src/i18n/index.ts",
      "src/i18n/namespaces/readme.md",
    ], probe);
    expect(files.map((f) => f.path)).toEqual([
      "src/i18n/namespaces/common.ts",
      "src/i18n/namespaces/app.tsx",
    ]);
  });
});

describe("buildPushPayload", () => {
  it("스키마를 통과한다 — 생산자와 계약이 이어져 있다는 유일한 증거다", () => {
    const { payload } = buildPushPayload(input);
    const parsed = PushPayload.safeParse(payload);
    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(parsed.success).toBe(true);
  });

  it("keys는 base 로케일에서만 온다", () => {
    const { payload } = buildPushPayload(input);
    expect(payload.keys.map((k) => k.key)).toEqual(["apple", "zebra"]);
  });

  it("order 0을 싣는다 — falsy라 조건문으로 거르면 파일의 첫 키가 순서를 잃는다", () => {
    const { payload } = buildPushPayload(input);
    expect(payload.keys.find((k) => k.key === "zebra")?.order).toBe(0);
  });

  it("order가 없으면 필드를 만들지 않는다 — 배열 인덱스로 채우지 않는다", () => {
    const noOrder = { ...input, read: { ...read, locales: [{ locale: "en", entries: [{ key: "a", message: "A" }] }] } };
    const { payload } = buildPushPayload(noOrder);
    expect(payload.keys[0]).not.toHaveProperty("order");
  });

  it("키의 description은 base 파일의 것이다", () => {
    const { payload } = buildPushPayload(input);
    expect(payload.keys.find((k) => k.key === "zebra")?.description).toBe("동물");
    expect(payload.keys.find((k) => k.key === "apple")).not.toHaveProperty("description");
  });

  it("namespace를 키에서 파생한다", () => {
    const nested = {
      ...input,
      read: { ...read, locales: [{ locale: "en", entries: [{ key: "common.ok", message: "OK" }] }] },
    };
    const { payload } = buildPushPayload(nested);
    expect(payload.keys[0]?.namespace).toBe("common");
  });

  it("translations는 base를 포함한 전 로케일에서 온다 — base도 편집 가능하다", () => {
    const { payload } = buildPushPayload(input);
    expect(payload.translations.filter((t) => t.locale === "en")).toHaveLength(2);
    expect(payload.translations.filter((t) => t.locale === "ko")).toHaveLength(2);
  });

  it("로케일별 description과 placeholders를 그 로케일 행에 싣는다 — 키 description과 다른 것이다", () => {
    const { payload } = buildPushPayload(input);
    const koApple = payload.translations.find((t) => t.locale === "ko" && t.key === "apple");
    const enApple = payload.translations.find((t) => t.locale === "en" && t.key === "apple");
    expect(koApple?.description).toBe("ko쪽 설명");
    expect(enApple).not.toHaveProperty("description");
    expect(enApple?.placeholders).toEqual({ u: { content: "$1" } });
  });

  it("로케일 파일에 없는 키를 참조하는 refs는 버리고 수를 돌려준다 (경고다, 실패가 아니다)", () => {
    const { payload, unknownRefs } = buildPushPayload(input);
    expect(payload.refs).toEqual([{ key: "apple", path: "src/a.ts", line: 3 }]);
    expect(unknownRefs).toBe(1);
  });

  it("nested는 read가 관측한 값이다 — detect는 이 값을 채울 수 없다", () => {
    const { payload } = buildPushPayload({ ...input, read: { ...read, nested: true } });
    expect(payload.format.nested).toBe(true);
  });

  it("format과 커밋 정보를 그대로 나른다", () => {
    const { payload } = buildPushPayload(input);
    expect(payload.format).toEqual({
      adapter: "chrome-locales",
      pathTemplate: "_locales/{locale}/messages.json",
      nested: false,
      baseLocale: "en",
    });
    expect(payload.commitSha).toBe("a".repeat(40));
    expect(payload.commitAt).toBe("2026-09-03T00:00:00+09:00");
    expect(payload.projectSlug).toBe("acme");
  });
});
