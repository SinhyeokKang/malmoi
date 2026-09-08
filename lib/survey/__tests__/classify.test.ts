import { describe, expect, it } from "vitest";

import { ADAPTER_ERROR_CODES, type AdapterErrorCode } from "@/lib/adapters/types";
import { classify } from "@/lib/survey/one";
import { READ_ERROR_KINDS, type ReadErrorKind } from "@/lib/survey/types";

/**
 * **지표 ③(`read` 에러 유형별)의 분류기가 코드로 옮겨간 것의 유일한 상시 방어선** (6b-1).
 *
 * 전에는 `classify(message)`가 한국어 부분 문자열로 갈랐고 **단위 테스트가 0건**이었다 —
 * tasks 6b-1이 "재측정만이 판정한다"고 적은 자리다. 재측정은 회차당 네트워크 8분이라 게이트가 될
 * 수 없고, 학습 코퍼스에 그 갈래가 한 번도 안 나타나면 회귀가 지표에 **0으로 조용히** 남는다
 * (POSTMORTEM 2026-09-02 "지표가 껍데기에서 버려졌다"와 같은 축).
 *
 * ⚠️ **그래서 옛 문구와 옛 분류기를 픽스처로 들고 대조한다.** 재측정 값이 §18(13차)과 한 칸도
 * 달라지지 않아야 하는 사이클이므로, "같은 사건이 같은 통에 들어간다"를 코드 층에서 먼저 고정한다.
 */

/** 코드마다 **옛 구현이 실제로 만들던 문구**. 이 표가 곧 회귀의 기준선이다. */
const LEGACY_MESSAGE: Record<AdapterErrorCode, string> = {
  "parse-failed": "JSON 파싱 실패: Unexpected token",
  "parse-crashed": "파싱 실패: boom",
  "root-not-object": "최상위가 객체가 아니다",
  "no-default-export": "default export 객체 리터럴을 찾을 수 없다",
  "invalid-chrome-key": "키 이름 'a.b'에 chrome.i18n이 허용하지 않는 문자가 있다 (허용: A-Z a-z 0-9 _ @)",
  "missing-message-field": "'k'에 message 필드가 없다",
  "value-not-message-object": "'k'의 값이 { message } 객체가 아니다",
  "value-not-string": "'grp'의 값이 문자열이 아니다 (object)",
  "value-not-string-or-container": "'k'의 값이 문자열이나 객체/배열이 아니다 (number)",
  "value-not-string-literal": "'k'의 값이 문자열 리터럴이 아니다 (CallExpression)",
  "shorthand-property": "'k'이 shorthand라 값을 읽을 수 없다 (import 참조로 보인다)",
  "not-property-assignment": "'...spread'은 프로퍼티 대입이 아니다",
  "duplicate-key": "'a'가 중복 키다 — 값 하나가 사라진다",
  // ── 아래는 write·껍데기 층이라 `read1.errors`에 들어가지 않는다. 옛 구현에서도 `other`였다. ──
  "key-shadowed": "'a.b'가 더 깊은 키의 접두라 중첩 복원에서 자리를 잃는다 — 이 값은 파일에 나가지 않는다",
  "write-parse-failed": "구문 오류로 원본을 그대로 둔다: boom",
  "write-no-default-export": "default export 객체 리터럴을 찾을 수 없다 — 원본을 그대로 둔다",
  "write-locale-object-missing": "'fr' 로케일 객체가 파일에 없어 번역을 반영하지 못했다",
  "write-slot-not-string-literal": "'k'가 문자열 리터럴 자리가 아니라 값을 넣지 못했다",
  "write-slot-not-scalar": "'k'가 스칼라 자리가 아니라 값을 넣지 못했다 (알리아스·맵·시퀀스)",
  "write-slot-missing": "'k'를 넣을 자리를 만들 수 없어 건너뛰었다 (구조 변경)",
  "original-file-missing": "원본 파일이 base 트리에 없어 수술적 치환을 건너뛰었다 — 이 로케일은 PR에 나가지 않는다",
  "download-failed": "could not download the file",
};

/** 옛 `classify(message)`를 그대로 옮긴 것. **손대지 않는다** — 기준선이라 값이 있다. */
function legacyClassify(message: string): ReadErrorKind {
  if (message.includes("JSON 파싱 실패") || message.includes("YAML 파싱 실패") || message.includes("구문 오류")) {
    return "json-parse";
  }
  if (message.includes("최상위가 객체가 아니다") || message.includes("최상위가 맵이 아니다")) {
    return "non-object-root";
  }
  if (message.includes("default export 객체 리터럴을 찾을 수 없다")) return "other";
  if (message.includes("값이 문자열이 아니다")) return "leaf-type";
  if (message.includes("중복 키다")) return "key-collision";
  if (message.includes("chrome.i18n이 허용하지 않는")) return "chrome-key";
  if (
    message.includes("문자열 리터럴이 아니다") ||
    message.includes("shorthand라 값을 읽을 수 없다") ||
    message.includes("프로퍼티 대입이 아니다")
  ) {
    return "non-literal-value";
  }
  if (
    message.includes("문자열이나 객체/배열이 아니다") ||
    message.includes("객체가 아니다") ||
    message.includes("message 필드가 없다")
  ) {
    return "leaf-type";
  }
  return "other";
}

describe("classify(code) — 지표 ③의 분류가 문구 기반과 한 칸도 다르지 않다", () => {
  it("코드마다 옛 문구와 같은 통에 들어간다", () => {
    const drifted = ADAPTER_ERROR_CODES.filter(
      (code) => classify(code) !== legacyClassify(LEGACY_MESSAGE[code]),
    ).map((code) => `${code}: ${classify(code)} ≠ ${legacyClassify(LEGACY_MESSAGE[code])}`);
    expect(drifted).toEqual([]);
  });

  it("기준선 표에 낡은 항목·누락이 없다 — 코드를 더하면 이 표도 늘어난다", () => {
    expect(Object.keys(LEGACY_MESSAGE).sort()).toEqual([...ADAPTER_ERROR_CODES].sort());
  });

  it("모든 코드가 알려진 갈래로 간다 — `other`로 뭉개지는 것은 옛 구현과 같은 셋뿐이다", () => {
    for (const code of ADAPTER_ERROR_CODES) expect(READ_ERROR_KINDS, code).toContain(classify(code));
  });

  /**
   * ⚠️ 옛 구현이 `구문 오류`(→ `json-parse`)와 `파싱 실패`(→ `other`)를 **다르게** 갈랐다.
   * 코드를 하나로 합치면 지표가 조용히 움직여 재측정 대조가 무의미해진다.
   */
  it("code-dict의 파서 예외는 구문 오류와 다른 통이다 — 합치면 지표가 움직인다", () => {
    expect(classify("parse-failed")).toBe("json-parse");
    expect(classify("parse-crashed")).toBe("other");
  });

  it("default export 부재는 일부러 `other`다 — 읽기 실패의 유형이 아니라 포맷 불일치다", () => {
    expect(classify("no-default-export")).toBe("other");
  });
});
