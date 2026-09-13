import { expect, it } from "vitest";

import { NAME_MAX_CHARS, planNameSave } from "../plan";

/**
 * 표시 이름 저장의 순수 판정 (account-settings 태스크 2).
 *
 * ⚠️ **거부가 값이다** — 던지면 Action이 그것을 `unavailable`로 접고, 사용자는 "저장이 안 된다"만
 * 본다. 사유가 화면에 닿으려면 반환값이어야 한다 (POSTMORTEM 2026-09-06).
 */
it("앞뒤 공백을 걷어 낸 값을 저장한다", () => {
  expect(planNameSave("  Jane Doe  ")).toEqual({ ok: true, name: "Jane Doe" });
  // 가운데 공백은 이름의 일부다 — 접으면 남이 나를 알아보는 이름이 바뀐다.
  expect(planNameSave("Jane  Doe")).toEqual({ ok: true, name: "Jane  Doe" });
});

it("빈 문자열과 공백만인 입력을 거부한다", () => {
  for (const raw of ["", " ", "\t", "\n", "   \t \n "]) {
    expect(planNameSave(raw), raw).toEqual({ ok: false, reason: "empty" });
  }
});

it("상한은 트림한 뒤에 재고 경계값은 통과시킨다", () => {
  const exact = "a".repeat(NAME_MAX_CHARS);
  expect(planNameSave(`  ${exact}  `)).toEqual({ ok: true, name: exact });
  expect(planNameSave("a".repeat(NAME_MAX_CHARS + 1))).toEqual({ ok: false, reason: "too-long" });
});

/**
 * ⚠️ **UTF-16 길이로 세지 않는다** — 이모지 하나가 `"🙂".length === 2`라 `.length`로 재면 상한이
 * 사람이 보는 글자 수의 절반이 된다. 한국어 이름이 안 걸리는 부류라 조용하다.
 */
it("이모지와 결합 문자를 사람이 보는 글자 수로 센다", () => {
  const emoji = "🙂".repeat(NAME_MAX_CHARS);
  expect(planNameSave(emoji)).toEqual({ ok: true, name: emoji });
  expect(planNameSave("🙂".repeat(NAME_MAX_CHARS + 1))).toEqual({ ok: false, reason: "too-long" });
  expect(planNameSave("한글 이름")).toEqual({ ok: true, name: "한글 이름" });
});
