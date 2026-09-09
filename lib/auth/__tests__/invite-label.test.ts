import { describe, expect, it } from "vitest";

import { maskEmail } from "../email";
import { maskedEmailLabels, maskedInviteLabels } from "../invite-label";

/**
 * **대기 초대 표에서는 마스킹한 주소가 유일한 식별자다** (malmoi#18).
 *
 * `maskEmail`은 첫 글자 + 도메인만 남기므로 `qa-invite-…@example.com`과 `qa-signed-out@example.com`이
 * 둘 다 `q***@example.com`이 된다. 멤버 표는 이름이 있어 괜찮지만 대기 초대 행은 주소뿐이고,
 * **[Revoke]는 되돌릴 수 없다**(복구는 새 링크 재발급) — 엉뚱한 사람의 링크를 무효화하게 된다.
 *
 * ⚠️ **`maskEmail`을 고치지 않는다.** 소비자가 셋이고(초대 화면·셀 메타·멤버 표) 지역 사본을 두면
 * 같은 주소가 화면마다 다르게 보인다 (CLAUDE.md). 이 함수는 **목록 전체를 보고** 충돌하는 행에만
 * 최소한을 더 보인다 — 충돌이 없으면 출력이 `maskEmail`과 글자 하나까지 같다.
 */
describe("maskedInviteLabels — 충돌하는 행만 구별한다", () => {
  it("충돌이 없으면 maskEmail과 같다 — 흔한 경우가 가장 조용하다", () => {
    const emails = ["ship4-check@example.com", "translator-t7@example.com"];
    expect(maskedInviteLabels(emails)).toEqual(emails.map(maskEmail));
  });

  it("빈 목록은 빈 목록이다", () => {
    expect(maskedInviteLabels([])).toEqual([]);
  });

  it("같은 마스킹으로 접히는 둘을 가른다 — malmoi#18의 실측 쌍", () => {
    const out = maskedInviteLabels(["qa-invite-1788618586045@example.com", "qa-signed-out@example.com"]);
    expect(new Set(out).size).toBe(2);
    expect(out[0]).not.toEqual(out[1]);
  });

  it("도메인은 항상 그대로다 — 마스킹하는 것은 로컬 파트다", () => {
    const out = maskedInviteLabels(["a-one@example.com", "a-two@example.com"]);
    for (const label of out) expect(label.endsWith("@example.com")).toBe(true);
  });

  it("필요한 만큼만 늘린다 — 두 글자로 갈리면 세 글자를 보이지 않는다", () => {
    const out = maskedInviteLabels(["ab-one@x.com", "ac-two@x.com"]);
    expect(out).toEqual(["ab***@x.com", "ac***@x.com"]);
  });

  it("공통 접두가 길면 갈릴 때까지 늘린다", () => {
    const out = maskedInviteLabels(["qa-invite@x.com", "qa-signed@x.com"]);
    expect(new Set(out).size).toBe(2);
    expect(out[0]).toContain("qa-i");
    expect(out[1]).toContain("qa-s");
  });

  /**
   * ⚠️ **한쪽이 다른 쪽의 접두이면 늘려도 안 갈린다** (`a@x.com` vs `ab@x.com`). 그때는 로컬 파트를
   * 전부 보인다 — 마스킹을 포기하는 것이 **엉뚱한 링크를 무효화하는 것보다 낫다**. 이 판정을
   * 명시적으로 고정하는 이유는 무한 루프나 조용한 중복 중 하나로 끝나기 쉬운 자리라서다.
   */
  it("접두 관계라 늘려도 안 갈리면 로컬 파트를 전부 보인다", () => {
    const out = maskedInviteLabels(["a@x.com", "ab@x.com"]);
    expect(out).toEqual(["a@x.com", "ab@x.com"]);
  });

  it("도메인이 다르면 첫 글자가 같아도 충돌이 아니다", () => {
    const out = maskedInviteLabels(["a-one@x.com", "a-two@y.com"]);
    expect(out).toEqual(["a***@x.com", "a***@y.com"]);
  });

  it("셋이 접히면 셋 다 갈린다", () => {
    const out = maskedInviteLabels(["qa-a@x.com", "qa-b@x.com", "qb-c@x.com"]);
    expect(new Set(out).size).toBe(3);
  });

  it("입력 순서를 지킨다 — 표의 행 순서가 조회 순서다", () => {
    const out = maskedInviteLabels(["z-one@x.com", "a-two@x.com"]);
    expect(out).toEqual(["z***@x.com", "a***@x.com"]);
  });

  it("`@`가 없는 값도 죽지 않는다 — maskEmail과 같은 폴백이다", () => {
    expect(maskedInviteLabels(["broken"])).toEqual([maskEmail("broken")]);
  });
});

/**
 * **같은 규칙이 두 표를 덮는다** (sec-audit 발견 4). 대기 초대에서 시작한 라벨 생성이 멤버 표에도
 * 필요해졌다 — 원문 이메일을 와이어에 안 싣기로 했으므로 **서버가** 두 표의 라벨을 만든다.
 *
 * ⚠️ **옛 이름을 지우지 않는다** — `docs/DESIGN.md` §6.65와 `CLAUDE.md`가 `maskedInviteLabels`를
 * 가리킨다. 본체가 일반형이고 그 이름은 얼은이다. 규칙이 두 벌이 되는 것이 이 리포가 반복해서
 * 밟은 부류다(`matchGlobPaths`·`scanJson`).
 */
describe("maskedEmailLabels — 일반형 (sec-audit 4)", () => {
  it("옛 이름과 글자 하나까지 같은 출력이다", () => {
    for (const emails of [
      ["a@x.com", "b@y.com"],
      ["qa-invite-1@example.com", "qa-signed-out@example.com"],
      ["a@x.com", "ab@x.com"],
      [],
      ["not-an-email"],
    ]) {
      expect(maskedEmailLabels(emails)).toEqual(maskedInviteLabels(emails));
    }
  });

  it("멤버 표에서도 충돌하는 행만 넓어진다", () => {
    expect(maskedEmailLabels(["alice@acme.com", "andrew@acme.com"])).toEqual([
      "al***@acme.com",
      "an***@acme.com",
    ]);
    expect(maskedEmailLabels(["alice@acme.com", "bob@other.com"])).toEqual([
      "a***@acme.com",
      "b***@other.com",
    ]);
  });
});
