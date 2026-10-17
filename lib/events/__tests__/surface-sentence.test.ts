import { en } from "@/messages/en";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { withRepoHost } from "@/lib/i18n/host";

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
 * **언어 변경 사건** (locale-add 시안 P3). 종류 폴백("changed Sources & languages")이 언어 사건에 남지 않는다 — 넷 모두 전용 문장이다.
 * 요청 행은 `asked to remove`이지 "removed"가 아니고(리포는 아직 그대로다), 만료 행만 관측한 사실을 쓴다. 옛 payload는 없는 부분을 뺀 문장이다.
 */
type Detail = { locale: string; operation: "ADD" | "REMOVE"; revived?: boolean | null; discarded?: number | null; outcome?: "active" | "orphan" | null;
  reissued?: number | null; pullRequest?: { number: number } | null; via?: "publish" | "sync" | "nightly" | "ci" | null };
const detail = (d: Detail) => ({ revived: null, discarded: null, outcome: null, reissued: null, pullRequest: null, via: null, ...d });
const localePayload = (d: Detail | undefined) => ({ kind: "SURFACE" as const, surfaceSlug: "web", adapter: null, baseLocale: null, ...(d === undefined ? {} : { localeChange: detail(d) }) });
const localeText = (subtype: string, d: Detail | undefined, m = en) => renderToStaticMarkup(eventSentence(m, "en", {
  kind: "SURFACE", subtype, result: null, payload: localePayload(d),
}, { actor: "Owner", key: null }));
const localeMeta = (subtype: string, d: Detail, actor: "USER" | "AUTOMATION" = "USER") => eventMeta(en, {
  kind: "SURFACE", subtype, result: null, actor: { kind: actor }, run: null, payload: localePayload(d),
}, false);
const fallback = renderToStaticMarkup(en.logs.sentence.fallback("Owner", en.logs.kinds.sources));

describe("eventSentence — 언어 변경 문장 (시안 P3)", () => {
  it.each<[string, string, Detail, string]>([
    ["추가", "surface.localeAdded", { locale: "fr", operation: "ADD", revived: false }, "Owner added fr to web"],
    ["되살린 추가", "surface.localeAdded", { locale: "es", operation: "ADD", revived: true, reissued: 164 }, "Owner added es to web again"],
    ["제거 요청", "surface.localeRemovalRequested", { locale: "de", operation: "REMOVE", discarded: 12 }, "Owner asked to remove de from web"],
    ["제거 취소", "surface.localeChangeCancelled", { locale: "de", operation: "REMOVE" }, "Owner cancelled removing de from web"],
    ["추가 취소", "surface.localeChangeCancelled", { locale: "zh_CN", operation: "ADD" }, "Owner stopped adding zh_CN to web"],
    ["머지된 제거", "surface.localeChangeResolved", { locale: "de", operation: "REMOVE", outcome: "orphan" }, "Owner closed the removal of de in web — the file is gone from the repository"],
    ["머지 없이 닫힌 제거", "surface.localeChangeResolved", { locale: "ja", operation: "REMOVE", outcome: "active", pullRequest: { number: 126 } },
      "Owner closed the removal of ja in web — #126 closed without merging, the file is still in the repository"],
    ["PR 번호 없는 미반영 제거", "surface.localeChangeResolved", { locale: "ja", operation: "REMOVE", outcome: "active" },
      "Owner closed the removal of ja in web — the file is still in the repository"],
    ["머지된 추가", "surface.localeChangeResolved", { locale: "fr", operation: "ADD", outcome: "active", pullRequest: { number: 126 } },
      "Owner closed the addition of fr in web — the file is in the repository"],
    ["머지 없이 닫힌 추가", "surface.localeChangeResolved", { locale: "fr", operation: "ADD", outcome: "orphan", pullRequest: { number: 126 } },
      "Owner closed the addition of fr in web — #126 closed without merging, the file isn&#x27;t in the repository"],
    ["결과를 모르는 옛 해소", "surface.localeChangeResolved", { locale: "de", operation: "REMOVE" }, "Owner closed the removal of de in web"],
  ])("%s", (_label, subtype, d, expected) => {
    expect(localeText(subtype, d)).toBe(expected);
  });

  it("넷 다 종류 폴백이 아니다 — localeChange가 없는 행도 언어 문장이다", () => {
    for (const subtype of ["surface.localeAdded", "surface.localeRemovalRequested", "surface.localeChangeCancelled", "surface.localeChangeResolved"]) {
      expect(localeText(subtype, undefined)).not.toBe(fallback);
      expect(localeText(subtype, undefined)).toBe("Owner changed a language in web");
      expect(localeText(subtype, { locale: "fr", operation: "ADD" })).not.toBe(fallback);
    }
  });

  it("GitLab은 번호가 !N이다 — home.meta.pr과 같은 표기", () => {
    expect(localeText("surface.localeChangeResolved", { locale: "ja", operation: "REMOVE", outcome: "active", pullRequest: { number: 126 } }, withRepoHost(en, "gitlab")))
      .toBe("Owner closed the removal of ja in web — !126 closed without merging, the file is still in the repository");
  });
});

describe("eventMeta — 언어 변경 보조줄", () => {
  it("언어 코드와 소스는 배지다 — 기준 언어 선언 안내는 없다", () => {
    const parts = localeMeta("surface.localeAdded", { locale: "fr", operation: "ADD", revived: false });
    expect(parts).toContainEqual({ kind: "locale", code: "fr" });
    expect(parts).toContainEqual({ kind: "badge", text: "web" });
    expect(parts).not.toContain(en.logs.meta.declarationOnly);
  });

  it("되살린 수 · 폐기한 미전달 편집 수를 사실로 싣는다 — 없거나 0이면 싣지 않는다", () => {
    expect(localeMeta("surface.localeAdded", { locale: "es", operation: "ADD", revived: true, reissued: 164 })).toContain("164 translations back");
    expect(localeMeta("surface.localeAdded", { locale: "es", operation: "ADD", revived: true, reissued: 1 })).toContain("1 translation back");
    expect(localeMeta("surface.localeAdded", { locale: "es", operation: "ADD", revived: true, reissued: null }).filter(part => typeof part === "string")).toEqual([]);
    expect(localeMeta("surface.localeRemovalRequested", { locale: "de", operation: "REMOVE", discarded: 12 })).toContain("12 unsent edits discarded");
    expect(localeMeta("surface.localeRemovalRequested", { locale: "de", operation: "REMOVE", discarded: 0 }).filter(part => typeof part === "string")).toEqual([]);
  });

  it("사람이 주체인 만료는 그 사람이 손으로 닫은 것이 아니다 — while publishing · while syncing", () => {
    expect(localeMeta("surface.localeChangeResolved", { locale: "ko", operation: "REMOVE", outcome: "orphan", via: "publish" })).toContain("while publishing");
    expect(localeMeta("surface.localeChangeResolved", { locale: "ko", operation: "REMOVE", outcome: "orphan", via: "sync" })).toContain("while syncing");
    // 자동화 주체는 행위자 낱말(Nightly · CI)이 이미 말한다. 옛 행(via 없음)은 지어내지 않는다.
    expect(localeMeta("surface.localeChangeResolved", { locale: "ko", operation: "REMOVE", outcome: "orphan", via: "nightly" }, "AUTOMATION").filter(part => typeof part === "string")).toEqual([]);
    expect(localeMeta("surface.localeChangeResolved", { locale: "ko", operation: "REMOVE", outcome: "orphan" }).filter(part => typeof part === "string")).toEqual([]);
  });
});

describe("eventGlyph — 언어 변경은 동작마다 글리프가 갈린다", () => {
  const glyph = (subtype: string, d?: Detail) => eventGlyph({ kind: "SURFACE", subtype, result: null, payload: d === undefined ? null : localePayload(d) }).icon;
  it.each<[string, Detail | undefined, string]>([
    ["surface.localeAdded", { locale: "fr", operation: "ADD", revived: false }, "circle-plus"],
    ["surface.localeAdded", { locale: "es", operation: "ADD", revived: true }, "rotate-ccw"],
    ["surface.localeRemovalRequested", { locale: "de", operation: "REMOVE" }, "circle-minus"],
    ["surface.localeChangeCancelled", { locale: "de", operation: "REMOVE" }, "undo-2"],
    ["surface.localeChangeResolved", { locale: "de", operation: "REMOVE", outcome: "orphan" }, "circle-check"],
    ["surface.localeChangeResolved", { locale: "ja", operation: "REMOVE", outcome: "active" }, "circle-dot"],
    ["surface.localeChangeResolved", { locale: "fr", operation: "ADD", outcome: "active" }, "circle-check"],
    ["surface.localeChangeResolved", undefined, "circle-dot"],
  ])("%s %j → %s", (subtype, d, icon) => {
    expect(glyph(subtype, d)).toBe(icon);
  });

  it("종류 색은 그대로 소스(청록)다", () => {
    expect(eventGlyph({ kind: "SURFACE", subtype: "surface.localeAdded", result: null }).tone).toBe("teal");
  });
});
