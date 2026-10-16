import { en } from "@/messages/en";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { eventGlyph, eventMeta, eventSentence, refusalMessage } from "../view";

/**
 * **소스 제거의 Logs 문장** (sources-add-remove B-T6). SURFACE 사건은 기준 언어 밖이 전부 `added`로 읽혀, 제거가 "added"로 그려졌다.
 * 되살림은 추가 사건 그대로라 문장이 같다.
 */
const text = (subtype: string) => renderToStaticMarkup(eventSentence(en, "en", {
  kind: "SURFACE", subtype, result: null,
  payload: { kind: "SURFACE", surfaceSlug: "web", adapter: "json-catalog", baseLocale: null },
}, { actor: "Owner", key: null }));

describe("eventSentence — surface.removed", () => {
  it("제거는 removed 문장이다", () => {
    expect(text("surface.removed")).toBe("Owner detached the web source");
  });

  it("추가·기준 언어는 그대로다 (위 대조)", () => {
    expect(text("surface.added")).toBe("Owner added the web source");
    expect(text("surface.baseLocaleDeclared")).toBe("Owner changed the base language of web");
  });
});

describe("refusalMessage — surface-removed", () => {
  it("제거된 소스로 온 CI의 거부는 워크플로 처방을 말한다", () => {
    expect(refusalMessage(en, "surface-removed")).toBe(en.logs.refusals["surface-removed"]);
    expect(refusalMessage(en, "surface-removed")).not.toBe(en.logs.refusals.fallback);
  });
});

/**
 * **언어 변경 사건** (locale-add design §6). SURFACE subtype을 모르는 폴백이 "added the web source"로 그렸다 — 언어 추가가 소스 추가로
 * 읽힌다. 전용 문장은 화면 문구 배치(시안 대기)가 정하고, 그 전까지 종류 폴백 문장이다. 옛 payload(`localeChange` 없음)도 읽힌다.
 */
describe("eventSentence — 언어 변경은 소스 추가로 그리지 않는다", () => {
  const LOCALE_SUBTYPES = ["surface.localeAdded", "surface.localeRemovalRequested", "surface.localeChangeCancelled", "surface.localeChangeResolved"];

  it.each(LOCALE_SUBTYPES)("%s", subtype => {
    const sentence = text(subtype);
    expect(sentence).not.toBe("Owner added the web source");
    expect(sentence).toBe(renderToStaticMarkup(en.logs.sentence.fallback("Owner", en.logs.kinds.sources)));
  });

  it("메타는 언어 코드와 소스를 싣는다 — 기준 언어 선언 안내는 없다", () => {
    const parts = eventMeta(en, {
      kind: "SURFACE", subtype: "surface.localeAdded", result: null, actor: { kind: "USER" }, run: null,
      payload: { kind: "SURFACE", surfaceSlug: "web", adapter: null, baseLocale: null,
        localeChange: { locale: "fr", operation: "ADD", revived: true, discarded: null, outcome: null } },
    }, false);
    expect(parts).toContainEqual({ kind: "locale", code: "fr" });
    expect(parts).toContainEqual({ kind: "badge", text: "web" });
    expect(parts).not.toContain(en.logs.meta.declarationOnly);
  });

  it("글리프는 파일 모양(소스 추가)이 아니다", () => {
    expect(eventGlyph({ kind: "SURFACE", subtype: "surface.localeAdded", result: null }).icon).not.toBe(eventGlyph({ kind: "SURFACE", subtype: "surface.added", result: null }).icon);
  });
});
