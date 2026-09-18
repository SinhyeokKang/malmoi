import { describe, expect, it } from "vitest";

import { ADAPTER_ERROR_CODES, type AdapterErrorCode } from "@/lib/adapters/types";
import { adapterErrorMessage } from "@/lib/i18n/adapter-errors";
import { en } from "@/messages/en";

/**
 * **어댑터 오류는 코드이고 문장은 사전이 낸다** (CLAUDE.md 코드 컨벤션, 6b-1).
 *
 * 전에는 어댑터가 한국어 자유 문자열을 만들어 온보딩 결과·Publish warnings·CLI에 그대로 실었다.
 * 화면에 닿는 값이 자유 문자열이면 en으로 바꿔도 사전 밖이라 **ko가 못 따라온다.**
 */
describe("adapterErrorMessage — 코드 → 문장", () => {
  it("코드마다 문장이 있다 — 갈래 누락이 없다", () => {
    const missing = ADAPTER_ERROR_CODES.filter((code) => typeof en.adapterErrors[code] !== "string");
    expect(missing).toEqual([]);
  });

  /** `fallback`은 코드가 아니다 — 모르는 코드가 왔을 때의 문장이라 union 밖에 있어야 한다. */
  it("사전에 낡은 코드가 없다 — 지운 코드의 문장이 남지 않는다", () => {
    const stale = Object.keys(en.adapterErrors).filter(
      (key) => key !== "fallback" && !(ADAPTER_ERROR_CODES as readonly string[]).includes(key),
    );
    expect(stale).toEqual([]);
  });

  it("문장이 영어다 — 사전이 한글을 담으면 이 검사가 잡는다", () => {
    const korean = Object.values(en.adapterErrors).filter((sentence) => /[가-힣]/.test(sentence));
    expect(korean).toEqual([]);
  });

  it("key가 없으면 문장만 낸다", () => {
    expect(adapterErrorMessage({ path: "i18n/en.json", code: "root-not-object" })).toBe(
      en.adapterErrors["root-not-object"],
    );
  });

  it("key가 있으면 어느 키인지 앞에 붙는다 — 903키 파일에서 그것만이 행동 가능한 정보다", () => {
    const out = adapterErrorMessage({ path: "i18n/en.json", code: "value-not-string", key: "a.deep" });
    expect(out).toContain("a.deep");
    expect(out).toContain(en.adapterErrors["value-not-string"]);
  });

  it("detail은 뒤에 붙는다 — 파서 원문은 진단이라 사전 밖이다", () => {
    const out = adapterErrorMessage({
      path: "i18n/en.yml",
      code: "parse-failed",
      detail: "Nested mappings are not allowed",
    });
    expect(out).toContain(en.adapterErrors["parse-failed"]);
    expect(out).toContain("Nested mappings are not allowed");
  });

  it("key와 detail이 함께 있으면 둘 다 실린다", () => {
    const out = adapterErrorMessage({
      path: "src/i18n/ns.ts",
      code: "value-not-string-literal",
      key: "grp.ok",
      detail: "CallExpression",
    });
    expect(out).toContain("grp.ok");
    expect(out).toContain("CallExpression");
  });

  /**
   * ⚠️ **프로토타입 키가 문장 자리에서 함수를 내면 화면이 죽는다** (POSTMORTEM 2026-09-08 🔴1 —
   * `pick`이 존재하는 이유). 이 값은 Server Action 반환을 타고 클라이언트로 가므로 `DICT[code]`를
   * 그대로 쓰면 안 된다.
   */
  it("모르는 코드는 폴백 문장이다 — 프로토타입 키도 포함한다", () => {
    for (const code of ["constructor", "toString", "hasOwnProperty", "nope"]) {
      const out = adapterErrorMessage({ path: "x", code: code as AdapterErrorCode });
      expect(typeof out, code).toBe("string");
      expect(out, code).toBe(en.adapterErrors.fallback);
    }
  });
});
