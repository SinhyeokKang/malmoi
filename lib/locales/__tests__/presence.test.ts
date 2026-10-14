import { describe, expect, it } from "vitest";

import { liveLocalesOf, localePresence } from "../presence";

describe("liveLocalesOf", () => {
  it("dedupes and sorts by code units", () => {
    expect(liveLocalesOf(["ko", "en", "ko", "En"])).toEqual(["En", "en", "ko"]);
  });
});

describe("localePresence — the strict import's existence rule", () => {
  it("observed codes are active, the rest orphan", () => {
    const live = liveLocalesOf(["en", "ko"]);
    expect(localePresence(live, "ko")).toBe("active");
    expect(localePresence(live, "fr")).toBe("orphan");
  });

  // 적재는 빈 목록이면 orphan 문장을 내지 않는다(`<> ALL('{}')`이 전부를 orphan시킨다) — 상태를 바꾸지 않는다.
  it("an empty observation changes nothing", () => {
    expect(localePresence(liveLocalesOf([]), "ko")).toBe("unchanged");
  });

  it("matches codes exactly, including __proto__", () => {
    expect(localePresence(["__proto__"], "__proto__")).toBe("active");
    expect(localePresence(["en"], "__proto__")).toBe("orphan");
    expect(localePresence(["pt_BR"], "pt-BR")).toBe("orphan");
  });
});
