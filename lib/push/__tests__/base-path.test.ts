import { describe, expect, it } from "vitest";

import type { DetectedFormat, ReadResult } from "@/lib/adapters/types";

import { checkFormat } from "../guard";
import { buildPushPayload, selectLocaleFiles } from "../payload";
import { PushPayload } from "../plan";

/**
 * push 경계의 `basePath` (mobile-strings design §2 "외부 계약"). CLI가 리포에서 다시 탐지하므로 basePath도 CLI 탐지가 내고,
 * `checkFormat`이 등록 값과 견준다. ⚠️ 옛 CLI는 필드를 안 보낸다 — 기존 4포맷 표면(null)에서 `format mismatch`가 되면 안 된다.
 */
const ANDROID_TEMPLATE = "app/src/main/res/values-{locale}/strings.xml";
const ANDROID_BASE = "app/src/main/res/values/strings.xml";

const valid = {
  projectSlug: "skillflo",
  surfaceSlug: "default",
  commitSha: "a".repeat(40),
  commitAt: "2026-08-31T16:38:15+09:00",
  format: { adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", nested: false, baseLocale: "en" },
  locales: ["en", "ko"],
  keys: [{ key: "a.b", sourceText: "V", namespace: "a" }],
  translations: [{ locale: "ko", key: "a.b", value: "값" }],
  refs: [],
};

describe("PushPayload.format.basePath", () => {
  it("없어도 통과한다 — 옛 CLI와 기존 네 포맷", () => {
    const parsed = PushPayload.safeParse(valid);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.format.basePath).toBeUndefined();
  });

  it("리포 안의 구체 경로면 통과한다", () => {
    const parsed = PushPayload.safeParse({ ...valid, format: { ...valid.format, basePath: ANDROID_BASE } });
    expect(parsed.data?.format.basePath).toBe(ANDROID_BASE);
  });

  /** POSTMORTEM 2026-09-09 — 경계 하나가 검증을 빠뜨리면 push 토큰이 설치 토큰으로 리포의 임의 파일에 쓴다. */
  it.each([
    "../.github/workflows/pwn.yml", "/etc/passwd", "a//b.xml", "", "a\\b.xml",
    // 구체 경로다 — 치환 토큰·글롭이 들어오면 저장 뒤 쓰기 경로가 모호해진다.
    "res/values-{locale}/strings.xml", "res/*/strings.xml",
  ])("리포를 벗어나거나 구체 경로가 아니면 거부한다: %j", (basePath) => {
    expect(PushPayload.safeParse({ ...valid, format: { ...valid.format, basePath } }).success).toBe(false);
  });
});

describe("checkFormat — basePath도 어느 표면인가의 일부다", () => {
  const stored = { adapterName: "json-catalog", pathTemplate: ANDROID_TEMPLATE, baseLocale: "en", declaredBaseLocale: null, basePath: null };
  const payload = { adapter: "json-catalog", pathTemplate: ANDROID_TEMPLATE, baseLocale: "en" };

  it("옛 CLI(필드 없음) + 저장 null → 통과 (null 대 undefined)", () => {
    expect(checkFormat(payload, stored)).toBe("ok");
  });

  it("같은 basePath면 통과한다", () => {
    expect(checkFormat({ ...payload, basePath: ANDROID_BASE }, { ...stored, basePath: ANDROID_BASE })).toBe("ok");
  });

  it("다르면 format mismatch다 — 경로 이전과 같은 취급", () => {
    expect(checkFormat({ ...payload, basePath: ANDROID_BASE }, stored)).toBe("wrong-format");
    expect(checkFormat(payload, { ...stored, basePath: ANDROID_BASE })).toBe("wrong-format");
    expect(checkFormat({ ...payload, basePath: "res/values/strings.xml" }, { ...stored, basePath: ANDROID_BASE })).toBe("wrong-format");
  });

  it("아직 비어 있는 행은 basePath가 있어도 통과한다 — 첫 push가 채운다", () => {
    expect(checkFormat({ ...payload, basePath: ANDROID_BASE }, { adapterName: null, pathTemplate: null, baseLocale: null, declaredBaseLocale: null, basePath: null })).toBe("ok");
  });
});

describe("buildPushPayload — 탐지가 낸 basePath를 싣는다", () => {
  const read: ReadResult = { nested: false, errors: [], locales: [{ locale: "en", entries: [{ key: "k", message: "V", order: 0 }] }] };
  const input = (format: DetectedFormat) => ({
    projectSlug: "p", surfaceSlug: "s", executionId: null, commitSha: "a".repeat(40), commitAt: "2026-08-31T16:38:15+09:00",
    format, read, baseLocale: "en", scanRefs: [],
  });

  it("있으면 format.basePath로 나간다", () => {
    const built = buildPushPayload(input({ adapter: "json-catalog", pathTemplate: ANDROID_TEMPLATE, basePath: ANDROID_BASE, locales: ["en"] }));
    expect(built.payload.format.basePath).toBe(ANDROID_BASE);
  });

  it("없으면 필드를 만들지 않는다 — 기존 네 포맷의 페이로드 바이트가 그대로다", () => {
    const built = buildPushPayload(input({ adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", locales: ["en"] }));
    expect(Object.keys(built.payload.format)).toEqual(["adapter", "pathTemplate", "nested", "baseLocale"]);
  });
});

describe("selectLocaleFiles — 기준 언어 파일은 basePath에서 읽는다", () => {
  const paths = [ANDROID_BASE, "app/src/main/res/values-ko/strings.xml", "app/src/main/res/values-en/strings.xml"];
  const probe = (p: string) => `<${p}>`;
  const format: DetectedFormat = { adapter: "json-catalog", pathTemplate: ANDROID_TEMPLATE, basePath: ANDROID_BASE, locales: ["en", "ko"] };

  it("기준 언어는 basePath, 나머지는 치환 — values-en/이 있어도 기준 언어 파일로 읽지 않는다", () => {
    expect(selectLocaleFiles("per-locale", format, paths, probe, "en").map((f) => f.path)).toEqual([ANDROID_BASE, "app/src/main/res/values-ko/strings.xml"]);
  });

  it("basePath가 없으면 지금처럼 치환이다", () => {
    const { basePath: _, ...plain } = format;
    expect(selectLocaleFiles("per-locale", plain, paths, probe, "en").map((f) => f.path)).toEqual([
      "app/src/main/res/values-en/strings.xml", "app/src/main/res/values-ko/strings.xml",
    ]);
  });
});
