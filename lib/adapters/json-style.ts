/**
 * 원본 JSON 파일의 **표현**을 관측해 그대로 되돌려준다 (`docs/features/format-preservation/`).
 *
 * **값은 DB에서, 표현은 원본에서** — ARCHITECTURE §1.4가 수술적 치환에 세운 그 문장을 재생성
 * 어댑터로 옮긴 것이다. 여기서 원본에서 읽는 것은 표현뿐이고 **값은 절대 아니다**(코어 원칙
 * "병합 없음"). 계약 테스트의 센티넬 네거티브가 그것을 강제한다.
 *
 * ⚠️ **`writeStrategy`는 그대로 `regenerate`다.** 원본이 없어도 파일을 만들어야 한다(신규 로케일
 * 파일) — 없으면 `DEFAULT_JSON_STYLE`로 떨어진다. 그 갈림이 수술적 치환과의 계약 차이다.
 *
 * 순수 함수다 — I/O가 없다.
 */

/** 지표(`lib/survey/json-shape.ts`)가 쓰는 모양. 문자열이 아니라 문자·폭으로 나눠 든다. */
export type IndentStyle = { char: "space" | "tab" | "none"; width: number };

/**
 * 원본에서 읽어낸 표현. **관측 실패라는 상태가 없다** — 못 읽으면 `DEFAULT_JSON_STYLE`이다.
 *
 * 지금은 들여쓰기 하나뿐이다. 한 줄 컨테이너·비ASCII 이스케이프는 커스텀 직렬화기가 필요해
 * 태스크 1b로 갈라 뒀다 (`JSON.stringify`로는 못 낸다).
 */
export type JsonStyle = {
  /** 한 단계 들여쓰기 문자열. `"  "` · `"    "` · `"\t"` 등 원본 리터럴 그대로. */
  indent: string;
};

/** 원본이 없거나 관측 불가일 때. 지금까지의 동작과 같다 — 2칸. */
export const DEFAULT_JSON_STYLE: JsonStyle = { indent: "  " };

/**
 * 첫 **들여쓴 줄**의 선행 공백.
 *
 * 깊은 층의 배수(4칸 파일의 2층은 8칸)에 흔들리지 않으려면 첫 층만 봐야 한다. 들여쓴 줄이
 * 없으면(한 줄 파일) `none`이다 — 0칸이라고 보고하면 "2칸이 아니다"가 되어 없는 원인이 선다.
 *
 * ⚠️ **혼합 들여쓰기에서는 근사다.** 첫 층만 보므로 아래 층이 다른 폭이면 그것을 못 본다.
 * 출력은 균일해지므로 재관측이 같은 값을 내 고정점은 성립한다.
 *
 * `lib/survey/json-shape.ts`가 이 함수를 import한다 — **두 벌이 되면 지표와 프로덕션이 서로 다른
 * 판정을 한다** (ARCHITECTURE §1.35의 "`writeWithErrors`의 content가 `write`와 갈라지지 않는다"와
 * 같은 축).
 */
export function indentOf(text: string): IndentStyle {
  for (const line of text.split("\n")) {
    const m = /^([ \t]+)\S/.exec(line);
    if (!m) continue;
    const lead = m[1]!;
    return lead[0] === "\t" ? { char: "tab", width: lead.length } : { char: "space", width: lead.length };
  }
  return { char: "none", width: 0 };
}

/** 원본 텍스트 → 스타일. **던지지 않는다** — 관측 불가면 DEFAULT다. */
export function observeJsonStyle(text: string | undefined): JsonStyle {
  if (text === undefined || text === "") return DEFAULT_JSON_STYLE;
  const observed = indentOf(text);
  if (observed.char === "none") return DEFAULT_JSON_STYLE;
  return { indent: (observed.char === "tab" ? "\t" : " ").repeat(observed.width) };
}

/**
 * 스타일대로 직렬화한다. 들여쓰기 2칸 고정을 대신하지만 **끝 개행 1개는 그대로 불변식이다**
 * (MVP §4.1 — `JSON.stringify`는 개행을 안 붙인다).
 *
 * ⚠️ **직렬화기를 직접 짜지 않는다.** `space`가 문자열을 받고 명세상 `space: 2`와 `space: "  "`가
 * **동일**하므로 기본 경로의 바이트 동일성이 구성상 참이고, 서로게이트 쌍·제어문자 이스케이프
 * 위험을 아예 지나지 않는다.
 */
export function serializeJson(value: unknown, style: JsonStyle = DEFAULT_JSON_STYLE): string {
  return `${JSON.stringify(value, null, style.indent)}\n`;
}
