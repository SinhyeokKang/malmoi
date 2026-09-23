import { describe, expect, it } from "vitest";
import { z } from "zod";

import { INVITATION_HOURLY_LIMIT } from "../plan";
import { parseRecipients, splitPastedEmails } from "../recipients";

/**
 * 다중 초대 입력 (docs/features/invitation-email design §2 · §3.2).
 *
 * ⚠️ **중복은 정규화한 원문으로 판정한다** — 마스킹한 라벨로 판정하면 서로 다른 두 주소가 같은
 * 행이 된다 (POSTMORTEM 2026-09-09 malmoi#18).
 */

describe("splitPastedEmails — 여러 주소 붙여 넣기", () => {
  it("쉼표·줄바꿈·세미콜론·공백으로 가른다", () => {
    expect(splitPastedEmails("a@x.com, b@x.com\nc@x.com;d@x.com\te@x.com  f@x.com")).toEqual([
      "a@x.com",
      "b@x.com",
      "c@x.com",
      "d@x.com",
      "e@x.com",
      "f@x.com",
    ]);
  });

  it("빈 조각은 버린다", () => {
    expect(splitPastedEmails(" ,\n\n a@x.com ,, ")).toEqual(["a@x.com"]);
    expect(splitPastedEmails("   ")).toEqual([]);
  });

  it("값을 정규화하지 않는다 — 입력칸에 보이는 대로 들어간다", () => {
    expect(splitPastedEmails("New@A.com")).toEqual(["New@A.com"]);
  });
});

describe("parseRecipients — 행별 역할 보존과 정규화", () => {
  it("행마다 역할을 그대로 들고 주소는 trim+소문자다", () => {
    expect(
      parseRecipients([
        { email: " New@A.com ", role: "EDITOR" },
        { email: "owner@b.com", role: "OWNER" },
      ]),
    ).toEqual({
      status: "ok",
      recipients: [
        { email: "new@a.com", role: "EDITOR" },
        { email: "owner@b.com", role: "OWNER" },
      ],
    });
  });

  it("완전히 빈 행은 수신자가 아니다 — 건너뛴다", () => {
    expect(
      parseRecipients([
        { email: "", role: "EDITOR" },
        { email: "a@x.com", role: "OWNER" },
        { email: "   ", role: "EDITOR" },
      ]),
    ).toEqual({ status: "ok", recipients: [{ email: "a@x.com", role: "OWNER" }] });
  });

  it("수신자가 하나도 없으면 empty다", () => {
    expect(parseRecipients([])).toEqual({ status: "empty" });
    expect(parseRecipients([{ email: " ", role: "EDITOR" }])).toEqual({ status: "empty" });
  });
});

describe("parseRecipients — 오류는 입력 인덱스로 돌려주고 일부만 보내지 않는다", () => {
  it("잘못된 주소는 그 행의 오류이고 요청 전체가 거부된다", () => {
    expect(
      parseRecipients([
        { email: "a@x.com", role: "EDITOR" },
        { email: "not-an-email", role: "EDITOR" },
      ]),
    ).toEqual({ status: "invalid-rows", rowErrors: [{ index: 1, code: "invalid-email" }] });
  });

  it("320자를 넘는 주소는 잘못된 주소다", () => {
    const long = `${"a".repeat(315)}@x.com`;
    expect(parseRecipients([{ email: long, role: "EDITOR" }])).toEqual({
      status: "invalid-rows",
      rowErrors: [{ index: 0, code: "invalid-email" }],
    });
  });

  it("조작된 역할은 값으로 거부된다 — DB enum에 닿기 전이다", () => {
    expect(parseRecipients([{ email: "a@x.com", role: "ADMIN" }])).toEqual({
      status: "invalid-rows",
      rowErrors: [{ index: 0, code: "invalid-role" }],
    });
  });

  it("정규화 후 같은 주소는 뒤 행이 duplicate다", () => {
    expect(
      parseRecipients([
        { email: "a@x.com", role: "EDITOR" },
        { email: "b@x.com", role: "EDITOR" },
        { email: " A@X.com", role: "EDITOR" },
      ]),
    ).toEqual({ status: "invalid-rows", rowErrors: [{ index: 2, code: "duplicate" }] });
  });

  it("같은 주소의 역할 충돌을 조용히 합치지 않는다", () => {
    expect(
      parseRecipients([
        { email: "a@x.com", role: "EDITOR" },
        { email: "a@x.com", role: "OWNER" },
      ]),
    ).toEqual({ status: "invalid-rows", rowErrors: [{ index: 1, code: "duplicate" }] });
  });

  it("빈 행을 건너뛰어도 인덱스는 원래 입력 기준이다", () => {
    expect(
      parseRecipients([
        { email: "", role: "EDITOR" },
        { email: "bad", role: "EDITOR" },
      ]),
    ).toEqual({ status: "invalid-rows", rowErrors: [{ index: 1, code: "invalid-email" }] });
  });

  it("오류가 여럿이면 전부 입력 순서로 모은다", () => {
    expect(
      parseRecipients([
        { email: "bad", role: "EDITOR" },
        { email: "a@x.com", role: "EDITOR" },
        { email: "a@x.com", role: "EDITOR" },
      ]),
    ).toEqual({
      status: "invalid-rows",
      rowErrors: [
        { index: 0, code: "invalid-email" },
        { index: 2, code: "duplicate" },
      ],
    });
  });

  it("`__proto__` 같은 주소 모양도 중복 판정이 흔들리지 않는다", () => {
    expect(
      parseRecipients([
        { email: "__proto__@x.com", role: "EDITOR" },
        { email: "__proto__@x.com", role: "EDITOR" },
      ]),
    ).toEqual({ status: "invalid-rows", rowErrors: [{ index: 1, code: "duplicate" }] });
  });
});

describe("parseRecipients — 한 요청의 주소 수 상한", () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ email: `u${i}@x.com`, role: "EDITOR" }));

  it("시간당 발급 상한과 같은 수까지 받는다", () => {
    const result = parseRecipients(rows(INVITATION_HOURLY_LIMIT));
    expect(result.status).toBe("ok");
  });

  it("상한을 넘으면 too-many다 — 앞에서 잘라 보내지 않는다", () => {
    expect(parseRecipients(rows(INVITATION_HOURLY_LIMIT + 1))).toEqual({
      status: "too-many",
      limit: INVITATION_HOURLY_LIMIT,
    });
  });

  it("빈 행은 상한에 세지 않는다", () => {
    const result = parseRecipients([...rows(INVITATION_HOURLY_LIMIT), { email: "", role: "EDITOR" }]);
    expect(result.status).toBe("ok");
  });
});

describe("parseRecipients — 주소 판정이 단건 초대의 zod 판정과 같다", () => {
  // 정규식을 옮겨 왔으므로(클라이언트 그래프에 zod를 못 들인다) 옮긴 사본이 원본과 갈리지 않는지 잰다.
  it.each([
    "a@x.com",
    "first.last+tag@sub.example.co.kr",
    "o'brien@x.io",
    ".lead@x.com",
    "double..dot@x.com",
    "trail.@x.com",
    "no-tld@x",
    "a@-x.com",
    "a@x.c",
    "한글@x.com",
    "a@x..com",
    "a b@x.com",
  ])("%s", (email) => {
    const zodOk = z.string().email().safeParse(email).success;
    expect(parseRecipients([{ email, role: "EDITOR" }]).status === "ok").toBe(zodOk);
  });
});
