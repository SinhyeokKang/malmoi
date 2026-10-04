import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ADAPTER_ERROR_CODES, type AdapterErrorCode } from "@/lib/adapters/types";
import { adapterErrorMessage, pullWarningLine, withWarningLines } from "@/lib/i18n/adapter-errors";
import type { Messages } from "@/lib/i18n";
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

/**
 * **pull 경고는 코드로 오고 문장은 받는 쪽이 조립한다** (ui-locales B1′). 외부 계약(MCP `publish` 응답 · `/api/pull` cron JSON)은
 * 코드로 바뀌기 전과 같은 영어 문장(`표면: 파일: 문장`)을 싣는다 — 여기서 그 모양을 고정한다.
 */
describe("pull 경고 조립", () => {
  const warning = { surfaceSlug: "default", path: "i18n/en.json", code: "value-not-string", key: "a.b", detail: "x" } as const;

  it("pullWarningLine은 옛 문장과 같은 `표면: 파일: 문장`이다", () => {
    expect(pullWarningLine(warning, en.adapterErrors)).toBe(`default: i18n/en.json: a.b — ${en.adapterErrors["value-not-string"]} (x)`);
  });

  it("문장은 받은 사전 절에서 온다 — 언어를 이 함수가 고르지 않는다", () => {
    const other = { ...en.adapterErrors, "value-not-string": "OTHER" } as Messages["adapterErrors"];
    expect(pullWarningLine(warning, other)).toBe("default: i18n/en.json: a.b — OTHER (x)");
    expect(adapterErrorMessage({ path: "x", code: "nope" as AdapterErrorCode }, { ...other, fallback: "FALLBACK" })).toBe("FALLBACK");
  });

  it("withWarningLines는 writer-warnings 갈래의 경고만 문장 배열로 바꾸고 나머지 필드는 그대로 둔다", () => {
    const item = { slug: "acme", action: "publish", status: "skipped", reason: "writer-warnings", warnings: [warning] } as const;
    expect(withWarningLines(item, en.adapterErrors)).toEqual({ ...item, warnings: [pullWarningLine(warning, en.adapterErrors)] });
  });

  it("다른 갈래는 같은 객체를 그대로 돌려준다", () => {
    const committed = { status: "committed", pr: "created" } as const;
    expect(withWarningLines(committed, en.adapterErrors)).toBe(committed);
    const failed = { slug: "acme", error: "x" };
    expect(withWarningLines(failed, en.adapterErrors)).toBe(failed);
  });
});

/** cron JSON도 같은 계약이다 — 라우트는 실행 결과를 내보내기 직전에 en으로 조립한다(ui-locales B1′). 라우트는 단위로 돌릴 수 없어 소스로 고정한다. */
it("/api/pull 응답은 writer 경고를 en 문장으로 조립해 내보낸다", () => {
  const src = readFileSync("app/api/pull/route.ts", "utf8");
  expect(src).toContain("results.map((item) => withWarningLines(item, en.adapterErrors))");
  expect(src).toContain('import { en } from "@/messages/en";');
});
